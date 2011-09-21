/**
 * Share slide with the slideshare flash API
 */

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

function loadPlayer() {
    //allowScriptAccess from other domains
    var params = { allowScriptAccess: "always" };
    var atts = { id: "player" };

    //doc: The path of the file to be used
    //startSlide: The number of the slide to start from
    //rel: Whether to show a screen with related slideshows at the end or not. 0 means false and 1 is true..
    var flashvars = { doc : "thirst-upload-800x600-1215534320518707-8", startSlide : 1, rel : 0 };

    //Generate the embed SWF file
    swfobject.embedSWF("http://static.slidesharecdn.com/swf/ssplayer2.swf", "player", "598", "300", "8", null, flashvars, params, atts);
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
        gapi.hangout.data.submitDelta({slide: ""+slide}, []);
    }));
}

(function() {
  if (gapi && gapi.hangout) {

    var initHangout = function() {
      prepareAppDOM();

      gapi.hangout.data.addStateChangeListener(onStateChanged);
      gapi.hangout.removeApiReadyListener(initHangout);
    };

    gapi.hangout.addApiReadyListener(initHangout);
  }
})();
