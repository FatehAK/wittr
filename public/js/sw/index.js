import { Promise } from "es6-promise";

var staticCacheName = 'wittr-static-v8';
var contentImgsCache = 'wittr-content-imgs';

var allCaches = [
  staticCacheName,
  contentImgsCache
];

//caching the requests (static assets)
//It's triggered as soon as the worker executes, and it's only called once per service worker.
//If you alter the service worker script the browser considers it a different service worker, and it'll get its own install event
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(staticCacheName).then((cache) => {
      return cache.addAll([
        '/skeleton',
        'js/main.js',
        'css/main.css',
        'imgs/icon.png',
        'https://fonts.gstatic.com/s/roboto/v15/2UX7WLTfW3W8TclTUvlFyQ.woff',
        'https://fonts.gstatic.com/s/roboto/v15/d-6IYplOFocCacKzxwXSOD8E0i7KZn-EPnyo3HZu7kw.woff'
      ]);
    })
  );
});

//the 'activate' event is fired when the service worker is ready to take control of the page
self.addEventListener('activate', function (event) {
  //for removing old caches
  //event.waitUntil() pauses the next events i.e fetch until this function is complete
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((cacheName) => {
          //don't remove our original caches
          return cacheName.startsWith('wittr-') && !allCaches.includes(cacheName);
        }).map((cacheName) => {
          return caches.delete(cacheName);
        })
      );
    })
  );
});

//manipulating responses
self.addEventListener('fetch', function (event) {
  var requestUrl = new URL(event.request.url);

  //serving a skeleton page from the cache
  if (requestUrl.origin === location.origin) {
    if (requestUrl.pathname === '/') {
      event.respondWith(caches.match('/skeleton'));
      return;
    }

    //serving photos from the cache
    if (requestUrl.pathname.startsWith('/photos/')) {
      event.respondWith(servePhoto(event.request));
      return;
    }

    //serving avatars from the cache
    if (requestUrl.pathname.startsWith('/avatars/')) {
      event.respondWith(serveAvatar(event.request));
      return;
    }
  }

  //if cache contains the response then return the response else make a new request
  //this is only for the static cache assets
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      } else {
        return fetch(event.request);
      }
    })
  );
});

//function for caching images
function servePhoto(request) {
  //cache only one image and not the responsive ones
  let storageUrl = request.url.replace(/-\d+px\.jpg$/, '');

  return caches.open(contentImgsCache).then((cache) => {
    return cache.match(storageUrl).then((response) => {
      //if image available in cache return it
      if (response) {
        return response;
      } else {
        //else we fetch the image and add it to the cache
        return fetch(request).then((networkResponse) => {
          //we clone the response since the response obj can only be used once
          cache.put(storageUrl, networkResponse.clone());
          return networkResponse;
        });
      }
    });
  });
}

//function for caching avatars
function serveAvatar(request) {

  let storageUrl = request.url.replace(/-\dx\.jpg$/, '');

  return caches.open(contentImgsCache).then((cache) => {
    return cache.match(storageUrl).then((response) => {
      //if avatar if available in cache fetch and then put in cache
      //since user may change avatars frequently and we don't want the user having old avatar from the cache
      let networkFetch = fetch(request).then((networkResponse) => {
        cache.put(storageUrl, networkResponse.clone());
        return networkResponse;
      });
      return response || networkFetch;
    });
  });

}

//get the message from the page using the service worker 'message' event
self.addEventListener('message', function (event) {
  if (event.data.action === 'skipWaiting') {
    //After it's successfully installed, the updated service worker delays activating until the existing service worker is no longer controlling clients.
    //This state is called "waiting", and it's how the browser ensures that only one version of your service worker is running at a time.
    //but we can skip waiting in the queue and take control of the page
    //the service worker activates as soon as it has finished installing and discards the old worker instantly
    self.skipWaiting();
  }
});
