/*
 * Copyright 2012 The Polymer Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file.
 */

if (typeof WeakMap === 'undefined') {
  (function() {
    var defineProperty = Object.defineProperty;
    var counter = Date.now() % 1e9;

    var WeakMap = function() {
      this.name = '__st' + (Math.random() * 1e9 >>> 0) + (counter++ + '__');
    };

    WeakMap.prototype = {
      set: function(key, value) {
        var entry = key[this.name];
        if (entry && entry[0] === key)
          entry[1] = value;
        else
          defineProperty(key, this.name, {value: [key, value], writable: true});
      },
      get: function(key) {
        var entry;
        return (entry = key[this.name]) && entry[0] === key ?
            entry[1] : undefined;
      },
      delete: function(key) {
        this.set(key, undefined);
      }
    };

    window.WeakMap = WeakMap;
  })();
}

/*
 * Copyright 2012 The Polymer Authors. All rights reserved.
 * Use of this source code is goverened by a BSD-style
 * license that can be found in the LICENSE file.
 */

(function(global) {

  var registrationsTable = new WeakMap();

  // We use setImmediate or postMessage for our future callback.
  var setImmediate = window.msSetImmediate;

  // Use post message to emulate setImmediate.
  if (!setImmediate) {
    var setImmediateQueue = [];
    var sentinel = String(Math.random());
    window.addEventListener('message', function(e) {
      if (e.data === sentinel) {
        var queue = setImmediateQueue;
        setImmediateQueue = [];
        queue.forEach(function(func) {
          func();
        });
      }
    });
    setImmediate = function(func) {
      setImmediateQueue.push(func);
      window.postMessage(sentinel, '*');
    };
  }

  // This is used to ensure that we never schedule 2 callas to setImmediate
  var isScheduled = false;

  // Keep track of observers that needs to be notified next time.
  var scheduledObservers = [];

  /**
   * Schedules |dispatchCallback| to be called in the future.
   * @param {MutationObserver} observer
   */
  function scheduleCallback(observer) {
    scheduledObservers.push(observer);
    if (!isScheduled) {
      isScheduled = true;
      setImmediate(dispatchCallbacks);
    }
  }

  function wrapIfNeeded(node) {
    return window.ShadowDOMPolyfill &&
        window.ShadowDOMPolyfill.wrapIfNeeded(node) ||
        node;
  }

  function dispatchCallbacks() {
    // http://dom.spec.whatwg.org/#mutation-observers

    isScheduled = false; // Used to allow a new setImmediate call above.

    var observers = scheduledObservers;
    scheduledObservers = [];
    // Sort observers based on their creation UID (incremental).
    observers.sort(function(o1, o2) {
      return o1.uid_ - o2.uid_;
    });

    var anyNonEmpty = false;
    observers.forEach(function(observer) {

      // 2.1, 2.2
      var queue = observer.takeRecords();
      // 2.3. Remove all transient registered observers whose observer is mo.
      removeTransientObserversFor(observer);

      // 2.4
      if (queue.length) {
        observer.callback_(queue, observer);
        anyNonEmpty = true;
      }
    });

    // 3.
    if (anyNonEmpty)
      dispatchCallbacks();
  }

  function removeTransientObserversFor(observer) {
    observer.nodes_.forEach(function(node) {
      var registrations = registrationsTable.get(node);
      if (!registrations)
        return;
      registrations.forEach(function(registration) {
        if (registration.observer === observer)
          registration.removeTransientObservers();
      });
    });
  }

  /**
   * This function is used for the "For each registered observer observer (with
   * observer's options as options) in target's list of registered observers,
   * run these substeps:" and the "For each ancestor ancestor of target, and for
   * each registered observer observer (with options options) in ancestor's list
   * of registered observers, run these substeps:" part of the algorithms. The
   * |options.subtree| is checked to ensure that the callback is called
   * correctly.
   *
   * @param {Node} target
   * @param {function(MutationObserverInit):MutationRecord} callback
   */
  function forEachAncestorAndObserverEnqueueRecord(target, callback) {
    for (var node = target; node; node = node.parentNode) {
      var registrations = registrationsTable.get(node);

      if (registrations) {
        for (var j = 0; j < registrations.length; j++) {
          var registration = registrations[j];
          var options = registration.options;

          // Only target ignores subtree.
          if (node !== target && !options.subtree)
            continue;

          var record = callback(options);
          if (record)
            registration.enqueue(record);
        }
      }
    }
  }

  var uidCounter = 0;

  /**
   * The class that maps to the DOM MutationObserver interface.
   * @param {Function} callback.
   * @constructor
   */
  function JsMutationObserver(callback) {
    this.callback_ = callback;
    this.nodes_ = [];
    this.records_ = [];
    this.uid_ = ++uidCounter;
  }

  JsMutationObserver.prototype = {
    observe: function(target, options) {
      target = wrapIfNeeded(target);

      // 1.1
      if (!options.childList && !options.attributes && !options.characterData ||

          // 1.2
          options.attributeOldValue && !options.attributes ||

          // 1.3
          options.attributeFilter && options.attributeFilter.length &&
              !options.attributes ||

          // 1.4
          options.characterDataOldValue && !options.characterData) {

        throw new SyntaxError();
      }

      var registrations = registrationsTable.get(target);
      if (!registrations)
        registrationsTable.set(target, registrations = []);

      // 2
      // If target's list of registered observers already includes a registered
      // observer associated with the context object, replace that registered
      // observer's options with options.
      var registration;
      for (var i = 0; i < registrations.length; i++) {
        if (registrations[i].observer === this) {
          registration = registrations[i];
          registration.removeListeners();
          registration.options = options;
          break;
        }
      }

      // 3.
      // Otherwise, add a new registered observer to target's list of registered
      // observers with the context object as the observer and options as the
      // options, and add target to context object's list of nodes on which it
      // is registered.
      if (!registration) {
        registration = new Registration(this, target, options);
        registrations.push(registration);
        this.nodes_.push(target);
      }

      registration.addListeners();
    },

    disconnect: function() {
      this.nodes_.forEach(function(node) {
        var registrations = registrationsTable.get(node);
        for (var i = 0; i < registrations.length; i++) {
          var registration = registrations[i];
          if (registration.observer === this) {
            registration.removeListeners();
            registrations.splice(i, 1);
            // Each node can only have one registered observer associated with
            // this observer.
            break;
          }
        }
      }, this);
      this.records_ = [];
    },

    takeRecords: function() {
      var copyOfRecords = this.records_;
      this.records_ = [];
      return copyOfRecords;
    }
  };

  /**
   * @param {string} type
   * @param {Node} target
   * @constructor
   */
  function MutationRecord(type, target) {
    this.type = type;
    this.target = target;
    this.addedNodes = [];
    this.removedNodes = [];
    this.previousSibling = null;
    this.nextSibling = null;
    this.attributeName = null;
    this.attributeNamespace = null;
    this.oldValue = null;
  }

  function copyMutationRecord(original) {
    var record = new MutationRecord(original.type, original.target);
    record.addedNodes = original.addedNodes.slice();
    record.removedNodes = original.removedNodes.slice();
    record.previousSibling = original.previousSibling;
    record.nextSibling = original.nextSibling;
    record.attributeName = original.attributeName;
    record.attributeNamespace = original.attributeNamespace;
    record.oldValue = original.oldValue;
    return record;
  };

  // We keep track of the two (possibly one) records used in a single mutation.
  var currentRecord, recordWithOldValue;

  /**
   * Creates a record without |oldValue| and caches it as |currentRecord| for
   * later use.
   * @param {string} oldValue
   * @return {MutationRecord}
   */
  function getRecord(type, target) {
    return currentRecord = new MutationRecord(type, target);
  }

  /**
   * Gets or creates a record with |oldValue| based in the |currentRecord|
   * @param {string} oldValue
   * @return {MutationRecord}
   */
  function getRecordWithOldValue(oldValue) {
    if (recordWithOldValue)
      return recordWithOldValue;
    recordWithOldValue = copyMutationRecord(currentRecord);
    recordWithOldValue.oldValue = oldValue;
    return recordWithOldValue;
  }

  function clearRecords() {
    currentRecord = recordWithOldValue = undefined;
  }

  /**
   * @param {MutationRecord} record
   * @return {boolean} Whether the record represents a record from the current
   * mutation event.
   */
  function recordRepresentsCurrentMutation(record) {
    return record === recordWithOldValue || record === currentRecord;
  }

  /**
   * Selects which record, if any, to replace the last record in the queue.
   * This returns |null| if no record should be replaced.
   *
   * @param {MutationRecord} lastRecord
   * @param {MutationRecord} newRecord
   * @param {MutationRecord}
   */
  function selectRecord(lastRecord, newRecord) {
    if (lastRecord === newRecord)
      return lastRecord;

    // Check if the the record we are adding represents the same record. If
    // so, we keep the one with the oldValue in it.
    if (recordWithOldValue && recordRepresentsCurrentMutation(lastRecord))
      return recordWithOldValue;

    return null;
  }

  /**
   * Class used to represent a registered observer.
   * @param {MutationObserver} observer
   * @param {Node} target
   * @param {MutationObserverInit} options
   * @constructor
   */
  function Registration(observer, target, options) {
    this.observer = observer;
    this.target = target;
    this.options = options;
    this.transientObservedNodes = [];
  }

  Registration.prototype = {
    enqueue: function(record) {
      var records = this.observer.records_;
      var length = records.length;

      // There are cases where we replace the last record with the new record.
      // For example if the record represents the same mutation we need to use
      // the one with the oldValue. If we get same record (this can happen as we
      // walk up the tree) we ignore the new record.
      if (records.length > 0) {
        var lastRecord = records[length - 1];
        var recordToReplaceLast = selectRecord(lastRecord, record);
        if (recordToReplaceLast) {
          records[length - 1] = recordToReplaceLast;
          return;
        }
      } else {
        scheduleCallback(this.observer);
      }

      records[length] = record;
    },

    addListeners: function() {
      this.addListeners_(this.target);
    },

    addListeners_: function(node) {
      var options = this.options;
      if (options.attributes)
        node.addEventListener('DOMAttrModified', this, true);

      if (options.characterData)
        node.addEventListener('DOMCharacterDataModified', this, true);

      if (options.childList)
        node.addEventListener('DOMNodeInserted', this, true);

      if (options.childList || options.subtree)
        node.addEventListener('DOMNodeRemoved', this, true);
    },

    removeListeners: function() {
      this.removeListeners_(this.target);
    },

    removeListeners_: function(node) {
      var options = this.options;
      if (options.attributes)
        node.removeEventListener('DOMAttrModified', this, true);

      if (options.characterData)
        node.removeEventListener('DOMCharacterDataModified', this, true);

      if (options.childList)
        node.removeEventListener('DOMNodeInserted', this, true);

      if (options.childList || options.subtree)
        node.removeEventListener('DOMNodeRemoved', this, true);
    },

    /**
     * Adds a transient observer on node. The transient observer gets removed
     * next time we deliver the change records.
     * @param {Node} node
     */
    addTransientObserver: function(node) {
      // Don't add transient observers on the target itself. We already have all
      // the required listeners set up on the target.
      if (node === this.target)
        return;

      this.addListeners_(node);
      this.transientObservedNodes.push(node);
      var registrations = registrationsTable.get(node);
      if (!registrations)
        registrationsTable.set(node, registrations = []);

      // We know that registrations does not contain this because we already
      // checked if node === this.target.
      registrations.push(this);
    },

    removeTransientObservers: function() {
      var transientObservedNodes = this.transientObservedNodes;
      this.transientObservedNodes = [];

      transientObservedNodes.forEach(function(node) {
        // Transient observers are never added to the target.
        this.removeListeners_(node);

        var registrations = registrationsTable.get(node);
        for (var i = 0; i < registrations.length; i++) {
          if (registrations[i] === this) {
            registrations.splice(i, 1);
            // Each node can only have one registered observer associated with
            // this observer.
            break;
          }
        }
      }, this);
    },

    handleEvent: function(e) {
      // Stop propagation since we are managing the propagation manually.
      // This means that other mutation events on the page will not work
      // correctly but that is by design.
      e.stopImmediatePropagation();

      switch (e.type) {
        case 'DOMAttrModified':
          // http://dom.spec.whatwg.org/#concept-mo-queue-attributes

          var name = e.attrName;
          var namespace = e.relatedNode.namespaceURI;
          var target = e.target;

          // 1.
          var record = new getRecord('attributes', target);
          record.attributeName = name;
          record.attributeNamespace = namespace;

          // 2.
          var oldValue =
              e.attrChange === MutationEvent.ADDITION ? null : e.prevValue;

          forEachAncestorAndObserverEnqueueRecord(target, function(options) {
            // 3.1, 4.2
            if (!options.attributes)
              return;

            // 3.2, 4.3
            if (options.attributeFilter && options.attributeFilter.length &&
                options.attributeFilter.indexOf(name) === -1 &&
                options.attributeFilter.indexOf(namespace) === -1) {
              return;
            }
            // 3.3, 4.4
            if (options.attributeOldValue)
              return getRecordWithOldValue(oldValue);

            // 3.4, 4.5
            return record;
          });

          break;

        case 'DOMCharacterDataModified':
          // http://dom.spec.whatwg.org/#concept-mo-queue-characterdata
          var target = e.target;

          // 1.
          var record = getRecord('characterData', target);

          // 2.
          var oldValue = e.prevValue;


          forEachAncestorAndObserverEnqueueRecord(target, function(options) {
            // 3.1, 4.2
            if (!options.characterData)
              return;

            // 3.2, 4.3
            if (options.characterDataOldValue)
              return getRecordWithOldValue(oldValue);

            // 3.3, 4.4
            return record;
          });

          break;

        case 'DOMNodeRemoved':
          this.addTransientObserver(e.target);
          // Fall through.
        case 'DOMNodeInserted':
          // http://dom.spec.whatwg.org/#concept-mo-queue-childlist
          var target = e.relatedNode;
          var changedNode = e.target;
          var addedNodes, removedNodes;
          if (e.type === 'DOMNodeInserted') {
            addedNodes = [changedNode];
            removedNodes = [];
          } else {

            addedNodes = [];
            removedNodes = [changedNode];
          }
          var previousSibling = changedNode.previousSibling;
          var nextSibling = changedNode.nextSibling;

          // 1.
          var record = getRecord('childList', target);
          record.addedNodes = addedNodes;
          record.removedNodes = removedNodes;
          record.previousSibling = previousSibling;
          record.nextSibling = nextSibling;

          forEachAncestorAndObserverEnqueueRecord(target, function(options) {
            // 2.1, 3.2
            if (!options.childList)
              return;

            // 2.2, 3.3
            return record;
          });

      }

      clearRecords();
    }
  };

  global.JsMutationObserver = JsMutationObserver;

//  if (!global.MutationObserver)
    global.MutationObserver = JsMutationObserver;


})(this);

window.Aniways = {
  init: function(){
    this.getMappings();
    if (document.getElementsByClassName('aniways-wall').length > 0){
      this.addWallObserver();
      return true;
    }
    console.log("Can't find element with aniways-wall class");
    return false;
  },
  assetsIdsToNames: JSON.parse(localStorage.getItem('aniwaysMappings')),
  assetsNamesToUrls: JSON.parse(localStorage.getItem('aniwaysAssets')),
  keywordsPath: "http://api.aniways.com/v2/keywords",
  assetsPath: "http://api.aniways.com/v2/assets",

  unicodeToDecimal: function (unicodeString){
    var base4Integer = "", radix = 4;
    var unicodeMapping = { "\u200B": 0, "\u200C": 1, "\u200D": 2, "\ufeff": 3 };
    for (var i = 0;  i < unicodeString.length; i+=1) {
      var mappedUnicode = unicodeMapping[unicodeString.charAt(i)];
      if(mappedUnicode === undefined){ return -1; }
      base4Integer = base4Integer + unicodeMapping[unicodeString.charAt(i)];
    }
    return parseInt(base4Integer, radix);
  },

  extractUnicodeEncodingData: function(message){
    var messageEncodingData = {data:[], message:""};
    var encodingData = {};
    var messageLength = message.length;
    for (var messageIndex = 0; messageIndex < messageLength; messageIndex++) {
      if (message.charCodeAt( messageIndex ) > 255) {
        encodingData = {};
        encodingData.phraseStart = messageIndex;
        message = this.removeAndRecordImageID(encodingData, message, messageIndex);
        message = this.removeAndRecordDelimiter(encodingData, "subPhraseStart", message, messageIndex);
        message = this.removeAndRecordDelimiter(encodingData, "subPhraseEnd", message, messageIndex);
        message = this.removeAndRecordDelimiter(encodingData, "phraseEnd", message, messageIndex);
        messageEncodingData.data.push(encodingData);
        messageIndex = encodingData.phraseEnd;
        messageLength = message.length;
      }
    }
    messageEncodingData.message = message;

    return messageEncodingData;

  },

  removeAndRecordImageID: function(encodingData, message, messageIndex){
    var lengthMapping = { "\u200B": 5, "\u200C": 11, "\u200D": 17, "\ufeff": 23 };
    var imageEncodingLength = lengthMapping[message.charAt(messageIndex)];
    var unicodeString = message.substr(messageIndex + 1, imageEncodingLength);
    encodingData.imageId = this.unicodeToDecimal(unicodeString);
    if(encodingData.imageId === -1){throw new AniwaysEncodingError("Mallformed image encoding");}
    return message.substr(0, messageIndex) + message.substr(messageIndex + imageEncodingLength + 1);
  },

  removeAndRecordDelimiter: function(encodingData, section, message, messageIndex){
    var delimiter = 8203;
    encodingData[section] = message.indexOf(String.fromCharCode(delimiter), messageIndex);
    if(encodingData[section] === -1){
      throw new AniwaysEncodingError("Can't find " + section + " delimiter");
    }
    return message.substr(0, encodingData[section]) + message.substr(encodingData[section] + 1);
  },


  decodeMessage: function(message){
    try {
      return this.unicodeDecoding(message);
    } catch(e) {
      if (e instanceof AniwaysEncodingError ) {
        return this.urlDecoding(message);
      }
    }
  },

  unicodeDecoding: function(message){
    if (this.assetsIdsToNames === null || this.assetsNamesToUrls === null) { return message; }
    var messageEncodingData = this.extractUnicodeEncodingData(message);
    var strippedMessage = messageEncodingData.message;
    var html = "";
    var start = 0;
    for (var i=0; i<messageEncodingData.data.length; i++ ) {
      var encodingData = messageEncodingData.data[i];

      var imagePath = this.assetsNamesToUrls[this.assetsIdsToNames[encodingData.imageId]];
      if(imagePath === undefined){
        html += strippedMessage.substring(start, encodingData.phraseEnd);
        start = encodingData.phraseEnd;

      }else{
        imagePath = imagePath.substring(0, imagePath.indexOf("::"));
        html += strippedMessage.substring(start, encodingData.subPhraseStart);
        html += "<img class='aniways-image' src='" + imagePath + "'  title='" +
          strippedMessage.substring(
            encodingData.subPhraseStart, encodingData.subPhraseEnd) +
          "'>";
        start = encodingData.subPhraseEnd;
      }
    }
    html += strippedMessage.substring(start);
    return html;

  },

  urlDecoding: function(message){
    var messageParts = message.split("\ufeff\ufeff\n\n");
    var originalMessage = messageParts[0];
    if (messageParts.length <= 1){
      return originalMessage;
    }
    var encodingData = this.extractUrlEncodingData(messageParts[1]);
    var count = 0;
    for (var data in encodingData) {
      if (encodingData.hasOwnProperty(data)) {
        if (data.indexOf("si") !== -1){
          count++;
        }
      }
    }
    var html = "";
    var start = 0;
    for (var j = 0; j < count; j++) {
      var imagePath = this.assetsNamesToUrls[encodingData['id' + j]];
      imagePath = imagePath.substring(0, imagePath.indexOf("::"));
      html += originalMessage.substring(start, parseInt(encodingData['si' + j]));
      html += "<img class='aniways-image' src='" + imagePath + "'  title='" + originalMessage.substring(parseInt(encodingData['si' + j]), parseInt(encodingData['si' + j]) + parseInt(encodingData['l' + j])) + "'>";
      start = parseInt(encodingData['l' + j]) + parseInt(encodingData['si' + j]);
    }
    html += originalMessage.substring(start);
    return html;
  },

  extractUrlEncodingData: function(url) {
    url = url.replace(/&amp;/g, '&');
    url = url.match(/((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/ );
    var query = url[0].split("?")[1];
    var data = query.split("&");
    var result = {};
    for (var i = 0; i < data.length; i++) {
      var item = data[i].split("=");
      result[item[0]] = item[1];
    }
    return result;
  },

  addWallObserver: function(callback) {

    var target = document.querySelector('.aniways-wall');

    addObserver(target, callback);

    function addObserver(target, callback){

      // create an observer instance
      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.type === 'childList') {
            var addedNodes = mutation.addedNodes;
            for (var i = 0; i < addedNodes.length; i++) {
              var node = addedNodes[i];
              handleNode(node, callback);
            }
          }
        });
      });

      // configuration of the observer:
      var config = { childList: true, subtree: true };

      // pass in the target node, as well as the observer options
      observer.observe(target, config);
    }

    function handleNode(node, callback){
      if(typeof node.getElementsByClassName === 'function'){
        var message;
        if(node.className === 'aniways-message'){
          message = [node];
        } else {
          message = node.getElementsByClassName('aniways-message');
        }
        if(message.length > 0){
          var decodedMessage = Aniways.decodeMessage(message[0].innerHTML);
          message[0].innerHTML = decodedMessage;
          if (callback) { callback(); }
        }
      }
    }
  },

  setMapping:function(){
    if (this.readyState === 4) {
      if (this.status === 200) {
        Aniways.assetsIdsToNames = JSON.parse(this.responseText).iconIdsToNames;
        localStorage.setItem("aniwaysMappings", JSON.stringify(Aniways.assetsIdsToNames));
      } else {
        console.error('There was a problem with the keywords request.');
      }
    }
  },

  setAssets:function(){
    if (this.readyState === 4) {
      if (this.status === 200) {
        Aniways.assetsNamesToUrls = JSON.parse(this.responseText).assets;
        localStorage.setItem("aniwaysAssets", JSON.stringify(Aniways.assetsNamesToUrls));
      } else {
        console.error('There was a problem with the assets request.');
      }
    }
  },

  getMappings: function(){
    ajaxGetMappings(this.keywordsPath, this.setMapping);
    ajaxGetMappings(this.assetsPath, this.setAssets);

    function ajaxGetMappings(url, callback){
      var httpRequest =  new XMLHttpRequest();
      httpRequest.onreadystatechange = callback;
      httpRequest.open('GET', url, true);
      httpRequest.send();
    }

  }

};

function AniwaysEncodingError(message) {
  this.message = message;
}
AniwaysEncodingError.prototype = new Error();
AniwaysEncodingError.prototype.constructor = AniwaysEncodingError;
