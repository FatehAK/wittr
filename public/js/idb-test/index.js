import idb from 'idb';

//for testing goto /idb-test

//creating our database
const dbPromise = idb.open('my-dba', 2, function (upgradeDb) {
  //creating an object store
  const store1 = upgradeDb.createObjectStore('objStore');
  store1.put('100', 'myKey1');
  //we create another store and specify the primary key as well
  const store2 = upgradeDb.createObjectStore('peopleStore', { keyPath: 'name' });
  //creating our index which indexes by 'age'
  store2.createIndex('ageIdx', 'age');
});

//getting the value fromt he store
dbPromise.then((db) => {
  //creating a trans obj for the object store
  const trans = db.transaction('objStore');
  //getting the object store from transaction
  const store = trans.objectStore('objStore');
  //returning the value specified by key (a promise is returned)
  return store.get('myKey1');
}).then((val) => {
  console.log('Value from db: ' + val);
});

//adding more values to the store
dbPromise.then((db) => {
  //get the trans obj in 'read/write' mode the default mode is read only
  const trans = db.transaction('objStore', 'readwrite');
  const store = trans.objectStore('objStore');
  store.put('200', 'myKey2');
  //return a resolved promise if the transaction completes
  return trans.complete;
}).then(() => {
  console.log('The transaction is complete');
});

dbPromise.then((db) => {
  //get trans in read/write
  const trans = db.transaction('objStore', 'readwrite');
  const store = trans.objectStore('objStore');
  store.put('300', 'myKey3');
  return store.get('myKey3');
}).then((val) => {
  console.log('Value from db: ' + val);
});

//add values to the 'peopleStore'
dbPromise.then((db) => {
  const trans = db.transaction('peopleStore', 'readwrite');
  const store = trans.objectStore('peopleStore');
  store.put({
    name: 'Jack Jones',
    age: 25,
  });

  store.put({
    name: 'Mark Shepherd',
    age: 34,
  });

  store.put({
    name: 'Billy Batson',
    age: 28,
  });

  store.put({
    name: 'James Doe',
    age: 39,
  });
  return trans.complete;
}).then(() => {
  console.log('People Added');
});

//getting our index values
dbPromise.then((db) => {
  const trans = db.transaction('peopleStore');
  const store = trans.objectStore('peopleStore');
  const ageIndex = store.index('ageIdx');

  return ageIndex.getAll();
}).then((val) => {
  console.log('The index by age is :', val);
});

//creating our cursor for manipulating values in the db
dbPromise.then((db) => {
  const trans = db.transaction('peopleStore');
  const store = trans.objectStore('peopleStore');
  const ageIndex = store.index('ageIdx');

  //using the index as reference obj and creating the cursor
  return ageIndex.openCursor();
}).then((cursor) => {
  console.log('Cursor Begins at: ', cursor.value);
  //advance two positions
  return cursor.advance(2);
}).then((cursor) => {
  console.log('Cursor Moved 2 posiions: ', cursor.value);
  //We could also do things like:
  //cursor.update(newValue) to change the value, or
  //cursor.delete() to delete this entry
  //advance one position
  return cursor.continue();
}).then((cursor) => {
  console.log('Cursor Next value: ', cursor.value);
});
