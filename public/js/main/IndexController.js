import PostsView from './views/Posts';
import ToastsView from './views/Toasts';
import idb from 'idb';
import { Promise } from 'es6-promise';

function openDatabase() {
  // If the browser doesn't support service worker,
  // we don't care about having a database
  if (!navigator.serviceWorker) {
    return Promise.resolve();
  }

  //we create a new database 'wittr' and pass in a callback that executed once
  return idb.open('wittr', 1, function (upgradeDb) {
    //create our object store and specify the primary key
    const store = upgradeDb.createObjectStore('wittrs', { keyPath: 'id' });
    store.createIndex('by-date', 'time');
  });
}

export default function IndexController(container) {
  this._container = container;
  this._postsView = new PostsView(this._container);
  this._toastsView = new ToastsView(this._container);
  this._lostConnectionToast = null;
  //getting the dbpromise
  this._dbPromise = openDatabase();
  //registering the service worker
  this._registerServiceWorker();
  //cleaning image cache
  this._cleanImageCache();

  const indexController = this;

  //cleaning our image cache every 30 minutes
  setInterval(function () {
    indexController._cleanImageCache();
  }, 1000 * 60 * 5);

  //first show the cached messages and then open the socket connection to the network
  this._showCachedMessages().then(function () {
    indexController._openSocket();
  });
}

//our main function that registers the service worker
IndexController.prototype._registerServiceWorker = function () {

  //if service worker not created then return
  if (!navigator.serviceWorker) {
    return;
  }

  const indexController = this;

  navigator.serviceWorker.register('/sw.js').then((reg) => {

    //if no contorller is controlling the page then return
    if (!navigator.serviceWorker.controller) {
      return;
    }

    //if there is an waiting worker, there is an update ready and waiting
    if (reg.waiting) {
      indexController._updateReady(reg.waiting);
      //exit from function
      return;
    }

    //if update in progress
    if (reg.installing) {
      indexController._trackInstalling(reg.installing);
      return;
    }

    //this event is fired when a new update is found
    reg.addEventListener('updatefound', function () {
      indexController._trackInstalling(reg.installing);
    });
  });

  //if the controller changes we refresh the page
  // Ensure refresh is only called once.
  // This works around a bug in "force update on reload".
  let refreshing;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (refreshing) {
      return;
    } else {
      window.location.reload();
      refreshing = true;
    }
  });
};

//function to track the installation of the service  worker
IndexController.prototype._trackInstalling = function (worker) {
  const indexController = this;
  //'statechange' event fired whenever the state property changes
  worker.addEventListener('statechange', function () {
    if (worker.state == 'installed') {
      indexController._updateReady(worker);
    }
  });
};

//function to show the cached messages from database
IndexController.prototype._showCachedMessages = function () {
  const indexController = this;

  return this._dbPromise.then((db) => {
    // if we're already showing posts, eg shift-refresh
    // or the very first load, there's no point fetching
    // posts from IDB
    if (!db || indexController._postsView.showingPosts()) return;

    //get the index
    let index = db.transaction('wittrs').objectStore('wittrs').index('by-date');

    //getting the messages from the db and displaying them with newest messages first
    return index.getAll().then((messages) => {
      indexController._postsView.addPosts(messages.reverse());
    });
  });
};

//function that handles the toast notification for the user
IndexController.prototype._updateReady = function (worker) {
  let toast = this._toastsView.show("New version available", {
    buttons: ['refresh', 'dismiss']
  });

  toast.answer.then((answer) => {
    if (answer != 'refresh') {
      return;
    } else {
      //send the signal from the page to the worker using postMessage()
      worker.postMessage({ action: 'skipWaiting' });
    }
  });
};

//function that opens a connection to the server for live updates
IndexController.prototype._openSocket = function () {
  const indexController = this;
  let latestPostDate = this._postsView.getLatestPostDate();

  // create a url pointing to /updates with the ws protocol
  let socketUrl = new URL('/updates', window.location);
  socketUrl.protocol = 'ws';

  if (latestPostDate) {
    socketUrl.search = 'since=' + latestPostDate.valueOf();
  }

  // this is a little hack for the settings page's tests,
  // it isn't needed for Wittr
  socketUrl.search += '&' + location.search.slice(1);

  let ws = new WebSocket(socketUrl.href);

  //add listeners
  ws.addEventListener('open', function () {
    if (indexController._lostConnectionToast) {
      indexController._lostConnectionToast.hide();
    }
  });

  //'message' event that checks the arrival of new messages
  ws.addEventListener('message', function (event) {
    requestAnimationFrame(function () {
      indexController._onSocketMessage(event.data);
    });
  });

  ws.addEventListener('close', function () {
    //tell the user that connection failed
    if (!indexController._lostConnectionToast) {
      indexController._lostConnectionToast = indexController._toastsView.show("Unable to connect. Retrying…");
    }

    //try and reconnect in 5 seconds
    setTimeout(function () {
      indexController._openSocket();
    }, 5000);
  });
};

//function that cleans the image cache
IndexController.prototype._cleanImageCache = function () {
  return this._dbPromise.then((db) => {
    //if db not created return
    if (!db) {
      return;
    }

    //the images to cache
    let imagesNeeded = [];

    let trans = db.transaction('wittrs');
    return trans.objectStore('wittrs').getAll().then(function (messages) {
      messages.forEach(function (message) {
        if (message.photo) {
          imagesNeeded.push(message.photo);
        }
        //we need the avatars as well
        imagesNeeded.push(message.avatar);
      });

      return caches.open('wittr-content-imgs');

    }).then((cache) => {
      return cache.keys().then((requests) => {
        requests.forEach((request) => {
          let url = new URL(request.url);
          if (!imagesNeeded.includes(url.pathname)) {
            //delete entries not needed
            cache.delete(request);
          }
        });
      });
    });
  });
};

//called when the web socket sends message data
IndexController.prototype._onSocketMessage = function (data) {

  let messages = JSON.parse(data);

  this._dbPromise.then((db) => {
    if (!db) {
      return;
    }

    let trans = db.transaction('wittrs', 'readwrite');
    let store = trans.objectStore('wittrs');
    messages.forEach(function (message) {
      store.put(message);
    });

    //limit store to 30 items
    //move cursor in backwards direction using .openCursor(null, 'prev)
    store.index('by-date').openCursor(null, "prev").then((cursor) => {
      //advance 30 values since we need them
      return cursor.advance(30);
    }).then(function deleteRest(cursor) {
      //delete the rest
      if (!cursor) {
        return;
      }
      cursor.delete();
      return cursor.continue().then(deleteRest);
    });
  });

  //add the posts to the view
  this._postsView.addPosts(messages);
};
