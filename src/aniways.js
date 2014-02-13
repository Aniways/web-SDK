window.Aniways = {
  init: function(){
    if (document.getElementsByClassName('aniways-wall').length > 0){
      this.addWallObserver();
    } else {
      console.log("Can't find element with aniways-wall class");
    }
  },
  unicodeMapping: {
    "\u200B": 0,
    "\u200C": 1,
    "\u200D": 2,
    "\ufeff": 3
  },
  lengthMapping: {
    "\u200B": 5,
    "\u200C": 11,
    "\u200D": 17,
    "\ufeff": 23
  },
  Delimiter: 8203,
  assetsIdsToNames: {},
  assetsNamesToUrls: {},
  keywordsPath: "http://api.aniways.com/v2/keywords",
  assetsPath: "http://api.aniways.com/v2/assets",

  unicodeToDecimal: function (unicodeString){
    var base4Integer = "";
    var radix = 4;
    for (var i = 0;  i < unicodeString.length; i++) {
      var mappedUnicode = this.unicodeMapping[unicodeString.charAt(i)];
      if(mappedUnicode === undefined){ return -1; }
      base4Integer = base4Integer + this.unicodeMapping[unicodeString.charAt(i)];
    }
    return parseInt(base4Integer, radix);
  },

  extractEncodingData: function(message){
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
    var imageEncodingLength = this.lengthMapping[message.charAt(messageIndex)];
    var unicodeString = message.substr(messageIndex + 1, imageEncodingLength);
    encodingData.imageId = this.unicodeToDecimal(unicodeString);
    if(encodingData.imageId === -1){
      throw new AniwaysEncodingError("Mallformed image encoding");
    }
    if(message.charCodeAt(messageIndex + imageEncodingLength + 1) > 255 &&
      message.charCodeAt(messageIndex + imageEncodingLength + 1) !== this.Delimiter ) {
      throw new AniwaysEncodingError("Mallformed image encoding");
    }
    return message.substr(0, messageIndex) + message.substr(messageIndex + imageEncodingLength + 1);
  },

  removeAndRecordDelimiter: function(encodingData, section, message, messageIndex){
    encodingData[section] = message.indexOf(String.fromCharCode(this.Delimiter), messageIndex);
    if(encodingData[section] === -1){
      throw new AniwaysEncodingError("Can't find " + section + " delimiter");
    }
    return message.substr(0, encodingData[section]) + message.substr(encodingData[section] + 1);
  },


  decodeMessage: function(message){
    try {
      return this.unicodeDecoding(message);
    }catch(e){
      if(e instanceof AniwaysEncodingError ){
        return this.urlDecoding(message);
      }
    }
  },

  unicodeDecoding: function(message){
    var messageEncodingData = this.extractEncodingData(message);
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
    var encodingData = this.getJsonFromUrl(messageParts[1]);
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
      html += originalMessage.substring(start, parseInt(encodingData['si' + j]));
      html += "<img class='aniways-image' src='http://az493648.vo.msecnd.net/aniways-assets/android/ldpi/" + encodingData['id' + j] + "'  title='" + originalMessage.substring(parseInt(encodingData['si' + j]), parseInt(encodingData['si' + j]) + parseInt(encodingData['l' + j])) + "'>";
      start = parseInt(encodingData['l' + j]) + parseInt(encodingData['si' + j]);
    }
    html += originalMessage.substring(start);
    return html;
  },

  getJsonFromUrl: function(url) {
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

  addWallObserver: function() {
    var target = document.querySelector('.aniways-wall');

    // create an observer instance
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.type === 'childList') {
          var addedNodes = mutation.addedNodes;
          for (var i = 0; i < addedNodes.length; i++) {
            var node = addedNodes[i];
            if(typeof node.getElementsByClassName === 'function'){
              var message = node.getElementsByClassName('aniways-text');
              if(message.length > 0){
                var decodedMessage = Aniways.decodeMessage(message[0].innerHTML);
                message[0].innerHTML = decodedMessage;
              }
            }
          }
        }
      });
    });

    // configuration of the observer:
    var config = { childList: true, subtree: true };

    // pass in the target node, as well as the observer options
    observer.observe(target, config);
  },

  setMapping:function(){
    if (this.readyState === 4) {
      if (this.status === 200) {
        localStorage.setItem('assetsIdsToNames', this.responseText);
        Aniways.assetsIdsToNames = JSON.parse(this.responseText).iconIdsToNames;
      } else {
        console.error('There was a problem with the keywords request.');
      }
    }
  },

  setAssets:function(){
    if (this.readyState === 4) {
      if (this.status === 200) {
        localStorage.setItem('assetsNamesToUrls', this.responseText);
        Aniways.assetsNamesToUrls = JSON.parse(this.responseText).assets;
      } else {
        console.error('There was a problem with the assets request.');
      }
    }
  }

};

function AniwaysEncodingError(message) {
  this.message = message;
}
AniwaysEncodingError.prototype = new Error();
AniwaysEncodingError.prototype.constructor = AniwaysEncodingError;

(function(){
  var idsToNames = localStorage.getItem('assetsIdsToNames');
  if(idsToNames === null){
    var mappingHttpRequest =  new XMLHttpRequest();
    mappingHttpRequest.onreadystatechange = Aniways.setMapping;
    mappingHttpRequest.open('GET', Aniways.keywordsPath, true);
    mappingHttpRequest.send();
  }else{
    Aniways.assetsIdsToNames = JSON.parse(idsToNames).iconIdsToNames;
  }
  var assetsNamesToUrls = localStorage.getItem('assetsNamesToUrls');
  if(assetsNamesToUrls === null){
    var assetsHttpRequest =  new XMLHttpRequest();
    assetsHttpRequest.onreadystatechange = Aniways.setAssets;
    assetsHttpRequest.open('GET', Aniways.assetsPath, true);
    assetsHttpRequest.send();
  } else{
    Aniways.assetsNamesToUrls = JSON.parse(assetsNamesToUrls).assets;
  }

})();
