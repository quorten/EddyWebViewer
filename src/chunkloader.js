/* An XHRLoader class that can maintain multiple partially downloaded
   chunks, one for each XMLHttpRequest.  */

import "oevns";
import "compat";
import "cothread";
import "ajaxloaders";

/* Note that this chunk loader assumes all chunks are loaded from the
   same URL.  */

// maxCache: Maximum size of chunk cache in characters.

var ChunkLoader = function(url, notifyFunc, maxCache) {
  this.url = url;
  this.notifyFunc = notifyFunc;
  this.httpRequest = null;
  this.chunks = [];
  this.chunkStarts = [];
  this.chunkTTags = []; /* Chunk "timestamp" tags */
  this.nextTTag = 0;
  this.maxCache = maxCache;
  this.cacheSize = 0;
};

OEV.ChunkLoader = ChunkLoader;
ChunkLoader.prototype = new XHRLoader(null, null);
ChunkLoader.constructor = ChunkLoader;

ChunkLoader.prototype.addChunk = function(responseText) {
  this.chunks.push(responseText);
  if (this.byteRange)
    this.chunkStarts.push(this.byteRange[0]);
  else
    this.chunkStarts.push(0);
  this.cacheSize += responseText.length;
};

ChunkLoader.prototype.startExec = function() {
  if (this.httpRequest) {
    this.httpRequest.abort();
    var httpRequest = this.httpRequest.responseText;
    if (httpRequest)
      this.addChunk(httpRequest);
    this.httpRequest = null;
  }
  return XHRLoader.prototype.startExec.call(this);
};

ChunkLoader.prototype.procData = function(httpRequest, responseText) {
  var doneProcData = false;
  var procError = false;

  // Program timed processing cothread loop here.
  doneProcData = true;

  if (procError) {
    httpRequest.abort();
    httpRequest.onreadystatechange = null;
    this.httpRequest = null;
    this.retVal = XHRLoader.PROC_ERROR;
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    return this.status;
  }

  if (httpRequest.readyState == 4 && doneProcData) {
    this.addChunk(responseText);

    /* Only manipulate the CothreadStatus object from within this
       function when processing is entirely finished.  */
    httpRequest.onreadystatechange = null;
    this.httpRequest = null;
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
  }

  return this.status;
};

/* Evict chunks from the cache in FIFO order until the cache does not
   exceed its maximum size.  */
ChunkLoader.prototype.evictOldChunks = function() {
  var chunks = this.chunks;
  var maxCache = this.maxCache;
  var cacheSize = this.cacheSize;

  while (cacheSize > maxCache) {
    cacheSize -= chunks[0].length;
    chunks.splice(0, 1);
  }
};

/* TODO handle onprogress events.  */

/* Join together consecutive requests.  */

/* Truncate overlapping requests.  */

/* Sort array elements */

/* Calculate size in advance */

/* Note consider reqLen public for this function.  */
