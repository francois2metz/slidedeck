/**
 * Share slide with the slideshare flash API
 */

/** @enum {string} */
var Answers = {
  YES: 'y',
  NO: 'n',
  MAYBE: 'm'
};
var HOST = '//hangoutsapi.appspot.com/static/yesnomaybe';

var DEFAULT_ICONS = {};
DEFAULT_ICONS[Answers.YES] = HOST + '/yes.png';
DEFAULT_ICONS[Answers.NO] = HOST + '/no.png';
DEFAULT_ICONS[Answers.MAYBE] = HOST + '/maybe.png';

var DEFAULT_STATUS = {};
DEFAULT_STATUS[Answers.YES] = 'Yes';
DEFAULT_STATUS[Answers.NO] = 'No';
DEFAULT_STATUS[Answers.MAYBE] = 'Maybe';

/**
 * The maximum length allowed for user status.
 * @const
 * @type {number}
 */
var MAX_STATUS_LENGTH = 255;

/**
 * Whether the user is currently editing his status.
 * @type {boolean}
 * @private
 */
var statusVisible_ = false;

/**
 * Shared state of the app.
 * @type {Object.<!string, !string>}
 * @private
 */
var state_ = null;

/**
 * Describes the shared state of the object.
 * @type {Object.<!string, Object.<!string, *>>}
 * @private
 */
var metadata_ = null;

/**
 * A list of the participants.
 * @type {Array.<gapi.hangout.Participant>}
 * @private
 */
var participants_ = null;

/**
 * The form that contains the status input element.
 * @type {Element}
 * @private
 */
var statusForm_ = null;

/**
 * The element used to input status messages.
 * @type {Element}
 * @private
 */
var statusInput_ = null;

/**
 * The container for the app controls.
 * @type {Element}
 * @private
 */
var container_ = null;

/**
 * Executes the provided function after a minor delay.
 * @param {function()} func The function to execute.
 */
function defer(func) {
  window.setTimeout(func, 10);
}

/**
 * Creates a key for use in the shared state.
 * @param {!string} id The user's hangoutId.
 * @param {!string} key The property to create a key for.
 * @return {!string} A new key for use in the shared state.
 */
function makeUserKey(id, key) {
  return id + ':' + key;
}

/**
 * Makes an RPC call to store the given value(s) in the shared state.
 * @param {!(string|Object.<!string, !string>)} keyOrState Either an object
 *     denoting the desired key value pair(s), or a single string key.
 * @param {!string} opt_value If keyOrState is a string, the associated value.
 */
var saveValue = null;

/**
 * Makes an RPC call to remove the given value(s) from the shared state.
 * @param {!(string|Array.<!string>)} keyOrListToRemove A single key
 *     or an array of strings to remove from the shared state.
 */
var removeValue = null;

/**
 * Makes an RPC call to add and/or remove the given value(s) from the shared
 * state.
 * @param {?(string|Object.<!string, !string>)} addState  Either an object
 *     denoting the desired key value pair(s), or a single string key.
 * @param {?(string|Object.<!string, !string>)} opt_removeState A list of keys
 *     to remove from the shared state.
 */
var submitDelta = null;

(function() {
  /**
   * Packages the parameters into a delta object for use with submitDelta.
   * @param {!(string|Object.<!string, !string>)}  Either an object denoting
   *     the desired key value pair(s), or a single string key.
   * @param {!string} opt_value If keyOrState is a string, the associated string
   *     value.
   */
  var prepareForSave = function(keyOrState, opt_value) {
    var state = null;
    if (typeof keyOrState === 'string') {
      state = {};
      state[keyOrState] = opt_value;
    } else if (typeof keyOrState === 'object' && null !== keyOrState) {
      // Ensure that no prototype-level properties are hitching a ride.
      state = {};
      for (var key in keyOrState) {
        if (keyOrState.hasOwnProperty(key)) {
          state[key] = keyOrState[key];
        }
      }
    } else {
      throw 'Unexpected argument.';
    }
    return state;
  };

  /**
   * Packages one or more keys to remove for use with submitDelta.
   * @param {!(string|Array.<!string>)} keyOrListToRemove A single key
   *     or an array of strings to remove from the shared state.
   * @return {!Array.<!string>} A list of keys to remove from the shared state.
   */
  var prepareForRemove = function(keyOrListToRemove) {
    var delta = null;
    if (typeof keyOrListToRemove === 'string') {
      delta = [keyOrListToRemove];
    } else if (typeof keyOrListToRemove.length === 'number' &&
               keyOrListToRemove.propertyIsEnumerable('length')) {
      // Discard non-string elements.
      for (var i = 0, iLen = keyOrListToRemove.length; i < iLen; ++i) {
        if (typeof keyOrListToRemove[i] === 'string') {
          delta.push(keyOrListToRemove[i]);
        }
      }
    } else {
      throw 'Unexpected argument.';
    }
    return delta;
  };

  /**
   * Makes an RPC call to add and/or remove the given value(s) from the shared
   * state.
   * @param {?(string|Object.<!string, !string>)} addState  Either an object
   *     denoting the desired key value pair(s), or a single string key.
   * @param {?(string|Object.<!string, !string>)} opt_removeState A list of keys
   *     to remove from the shared state.
   */
  var submitDeltaInternal = function(addState, opt_removeState) {
    gapi.hangout.data.submitDelta(addState, opt_removeState);
  };

  saveValue = function(keyOrState, opt_value) {
    var delta = prepareForSave(keyOrState, opt_value);
    if (delta) {
      submitDeltaInternal(delta);
    }
  };

  removeValue = function(keyOrListToRemove) {
    var delta = prepareForRemove(keyOrListToRemove);
    if (delta) {
      submitDeltaInternal({}, delta);
    }
  };

  submitDelta = function(addState, opt_removeState) {
    if ((typeof addState !== 'object' && typeof addState !== 'undefined') ||
        (typeof opt_removeState !== 'object' &&
         typeof opt_removeState !== 'undefined')) {
      throw 'Unexpected value for submitDelta';
    }
    var toAdd = addState ? prepareForSave(addState) : {};
    var toRemove = opt_removeState ? prepareForRemove(opt_removeState) :
        undefined;
    submitDeltaInternal(toAdd, toRemove);
  };
})();

/**
 * Stores the user's answer in the shared state, or removes it from the shared
 * state if it is the same as the current value.
 * @param {!Answers} newAnswer The user's answer.
 */
function onAnswer(newAnswer) {
  // Gets the temporary hangout id, corresponding to Participant.hangoutId
  // rather than Participant.id.
  var myId = getUserHangoutId();

  var answerKey = makeUserKey(myId, 'answer');
  var current = getState(answerKey);

  if (current === newAnswer) {
    removeValue(answerKey);
  } else {
    saveValue(answerKey, newAnswer);
  }
}

/**
 * @param {!string} participantId The hangoutId of a Participant.
 * @return {string} The status of the given Participant.
 */
function getStatusMessage(participantId) {
  return getState(makeUserKey(participantId, 'status'));
}

/**
 * Sets the status for the current user.
 * @param {!string} message The user's new status.
 */
function setStatusMessage(message) {
  saveValue(makeUserKey(getUserHangoutId(), 'status'), message);
}

/**
 * Displays the input allowing a user to set his status.
 * @param {!Element} linkElement The link that triggered this handler.
 */
function onSetStatus(linkElement) {
  statusVisible_ = true;
  statusInput_.fadeIn(500);
  $(linkElement).parent('p').hide();
  $(linkElement).parent('p').parent().append(statusInput_);
  statusInput_.val(getStatusMessage(getUserHangoutId()));
  // Since faceIn is a black box, focus & select only if the input is already
  // visible.
  statusInput_.filter(':visible').focus().select();
}

/**
 * Sets the user's status message and hides the input element.
 */
function onSubmitStatus() {
  if (statusVisible_) {
    statusVisible_ = false;
    var statusVal = statusInput_.val();
    statusVal = statusVal.length < MAX_STATUS_LENGTH ? statusVal :
        statusVal.substr(0, MAX_STATUS_LENGTH);
    setStatusMessage(statusVal);
    statusForm_.append(statusInput_);
    statusInput_.hide();
    render();
  }
}

/**
 * Gets the value of opt_stateKey in the shared state, or the entire state
 * object if opt_stateKey is null or not supplied.
 * @param {?string=} opt_stateKey The key to get from the state object.
 * @return {(string|Object.<string,string>)} A state value or the state object.
 */
function getState(opt_stateKey) {
  return (typeof opt_stateKey === 'string') ? state_[opt_stateKey] : state_;
}

/**
 * Gets the value of opt_metadataKey in the shared state, or the entire
 * metadata object if opt_metadataKey is null or not supplied.
 * @param {?string=} opt_metadataKey The key to get from the metadata object.
 * @return {(Object.<string,*>|Object<string,Object.<string,*>>)} A metadata
 *     value or the metadata object.
 */
function getMetadata(opt_metadataKey) {
  return (typeof opt_metadataKey === 'string') ? metadata_[opt_metadataKey] :
      metadata_;
}

/**
 * @return {string} The user's ephemeral id.
 */
function getUserHangoutId() {
  return gapi.hangout.getParticipantId();
}

/**
 * Renders the app.
 */
function render() {
  if (!state_ || !metadata_ || !participants_ || !container_) {
    return;
  }

  if (statusVisible_) {
    // Wait until we're done editing status, otherwise everything will render,
    // messing up our edit.
    return;
  }

  var data = {
    total: 0,
    responded: false
  };
  data[Answers.YES] = [];
  data[Answers.NO] = [];
  data[Answers.MAYBE] = [];

  var myId = getUserHangoutId();
  for (var i = 0, iLen = participants_.length; i < iLen; ++i) {
    var p = participants_[i];
    // Temporary id, corresponds to getUserHangoutId().
    var answerKey = makeUserKey(p.hangoutId, 'answer');
    var answer = getState(answerKey);
    var meta = getMetadata(answerKey);

    if (answer && data[answer]) {
      data[answer].push(p);
      if (p.hangoutId === myId) {
        data.responded = true;
      }
      ++data.total;

      var name = p.displayName;
      var parts = name.split('@');
      if (parts && parts.length > 1) {
        p.displayName = parts[0];
      }

      p.status = getStatusMessage(p.hangoutId) || '';
      // The server stores a timestamp for us on each change. We'll use this
      // value to display users in the order in which they answer.
      p.sortOrder = meta.timestamp;
    }
  }

  // Sort by vote order.
  var sortFunc = function(a, b) {
    return a.sortOrder - b.sortOrder;
  };
  for (var answer in data) {
    if (data.hasOwnProperty(answer) && data[answer].sort) {
      data[answer].sort(sortFunc);
    }
  }
}

/**
 * Syncs local copies of shared state with those on the server and renders the
 *     app to reflect the changes.
 * @param {!Array.<Object.<!string, *>>} add Entries added to the shared state.
 * @param {!Array.<!string>} remove Entries removed from the shared state.
 * @param {!Object.<!string, !string>} state The shared state.
 * @param {!Object.<!string, Object.<!string, *>>} metadata Data describing the
 *     shared state.
 */
function onStateChanged(add, remove, state, metadata) {
    var slide = state.slide;
    var player = $('#player').get(0).jumpTo(parseInt(slide, 10));
}

/**
 * Syncs local copy of the participants list with that on the server and renders
 *     the app to reflect the changes.
 * @param {!Array.<gapi.hangout.Participant>} participants The new list of
 *     participants.
 */
function onParticipantsChanged(participants) {
  participants_ = participants;
  render();
}

function loadPlayer() {
    //allowScriptAccess from other domains
    var params = { allowScriptAccess: "always" };
    var atts = { id: "player" };

    //doc: The path of the file to be used
    //startSlide: The number of the slide to start from
    //rel: Whether to show a screen with related slideshows at the end or not. 0 means false and 1 is true..
    var flashvars = { doc : "thirst-upload-800x600-1215534320518707-8", startSlide : 1, rel : 0 };

    //Generate the embed SWF file
    swfobject.embedSWF("http://static.slidesharecdn.com/swf/ssplayer2.swf", "player", "598", "480", "8", null, flashvars, params, atts);
}

//Jump to the appropriate slide
function jumpTo(){
    flashMovie.jumpTo(parseInt(document.getElementById("slidenumber").value));
}

/**
 * Create required DOM elements and listeners.
 */
function prepareAppDOM() {
    $('body').append($('<div>').attr('id', 'player'));
    loadPlayer();
    $('body').append($('<button>').text('Next').click(function() {
        var player = $('#player').get(0);
        player.next();
        var slide = player.getCurrentSlide();
        gapi.hangout.data.submitDelta({slide: slide}, {});
    }));
}


/**
 * Creates the DOM element that shows a single participant's answer.
 * @param {!gapi.hangout.Participant} participant The participant to create the
 *     display element for.
 * @param {!Answers} response The participant's answer.
 * @return {Element} A DOM element which shows a participant and allows him to
 *     modify his status.
 */
function createParticipantElement(participant, response) {
  var avatar = $('<img />').attr({
    'width': '27',
    'alt': 'Avatar',
    'class': 'avatar',
    'src': participant.image && participant.image.url ? participant.image.url :
        DEFAULT_ICONS[response]
  });

  var name = $('<h2 />').text(participant.displayName);

  var statusText = getStatusMessage(participant.hangoutId) || '';
  var statusAnchor = $('<p />')
      .addClass('status-anchor')
      .text(statusText + ' ');
  if (participant.hangoutId === getUserHangoutId()) {
    var triggerLink = $('<a href="#" class="link" />')
        .text(statusText ? 'Edit' : 'Set your status')
        .click(function() {
          onSetStatus(this);
          return false;
        });

    statusAnchor.append(triggerLink);
  }

  return $('<li />').append(avatar, name, statusAnchor);
}

(function() {
  if (gapi && gapi.hangout) {

    var initHangout = function() {
      prepareAppDOM();

      gapi.hangout.data.addStateChangeListener(onStateChanged);
      gapi.hangout.addParticipantsListener(onParticipantsChanged);

      if (!state_) {
        var initState = gapi.hangout.data.getState();
        var initMetadata = gapi.hangout.data.getStateMetadata();
        // Since this is the first push, added has all the values in metadata in
        // Array form.
        var added = [];
        for (var key in initMetadata) {
          if (initMetadata.hasOwnProperty(key)) {
            added.push(initMetadata[key]);
          }
        }
        var removed = [];
        if (initState && initMetadata) {
          onStateChanged(added, removed, initState, initMetadata);
        }
      }
      if (!participants_) {
        var initParticipants = gapi.hangout.getParticipants();
        if (initParticipants) {
          onParticipantsChanged(initParticipants);
        }
      }

      gapi.hangout.removeApiReadyListener(initHangout);
    };

    gapi.hangout.addApiReadyListener(initHangout);
  }
})();
