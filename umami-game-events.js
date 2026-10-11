/**
 * Umami Analytics - Unity WebGL Game Event Tracking
 * 
 * This file provides JavaScript functions that Unity WebGL can call
 * to track game events in Umami Analytics.
 * 
 * Usage from Unity C#:
 * 
 * [DllImport("__Internal")]
 * private static extern void umamiTrack(string eventName);
 * 
 * Then call: umamiTrack("game_start");
 */

// Check if umami is loaded
function isUmamiLoaded() {
  return typeof umami !== 'undefined' && typeof umami.track === 'function';
}

/**
 * Track a custom event in Umami
 * @param {string} eventName - The name of the event to track
 * @param {object} eventData - Optional event data/properties
 */
function umamiTrack(eventName, eventData) {
  if (isUmamiLoaded()) {
    try {
      if (eventData) {
        umami.track(eventName, eventData);
      } else {
        umami.track(eventName);
      }
      console.log(`[Umami] Tracked event: ${eventName}`, eventData || '');
    } catch (error) {
      console.error(`[Umami] Failed to track event: ${eventName}`, error);
    }
  } else {
    console.warn('[Umami] Analytics not loaded yet. Event not tracked:', eventName);
  }
}

/**
 * Track game start event
 */
function trackGameStart() {
  umamiTrack('game_start');
}

/**
 * Track level start events
 * @param {number} levelNumber - The level number that is starting
 */
function trackLevelStart(levelNumber) {
  umamiTrack(`level${levelNumber}_start`, { level: levelNumber });
}

/**
 * Track level 1 start specifically
 */
function trackLevel1Start() {
  umamiTrack('level1_start', { level: 1 });
}

/**
 * Track level 2 start specifically
 */
function trackLevel2Start() {
  umamiTrack('level2_start', { level: 2 });
}

/**
 * Track level 3 start specifically
 */
function trackLevel3Start() {
  umamiTrack('level3_start', { level: 3 });
}

/**
 * Track level 4 start specifically
 */
function trackLevel4Start() {
  umamiTrack('level4_start', { level: 4 });
}

/**
 * Track level completion events
 * @param {number} levelNumber - The level number that was completed
 */
function trackLevelComplete(levelNumber) {
  umamiTrack(`level${levelNumber}_complete`, { level: levelNumber });
}

/**
 * Track level 1 completion specifically
 */
function trackLevel1Complete() {
  umamiTrack('level1_complete', { level: 1 });
}

/**
 * Track level 2 completion specifically
 */
function trackLevel2Complete() {
  umamiTrack('level2_complete', { level: 2 });
}

/**
 * Track level 3 completion specifically
 */
function trackLevel3Complete() {
  umamiTrack('level3_complete', { level: 3 });
}

/**
 * Track level 4 completion specifically
 */
function trackLevel4Complete() {
  umamiTrack('level4_complete', { level: 4 });
}

/**
 * Track player death event
 * @param {string} cause - Optional cause of death
 */
function trackPlayerDeath(cause) {
  if (cause) {
    umamiTrack('player_death', { cause: cause });
  } else {
    umamiTrack('player_death');
  }
}

/**
 * Track game over event
 */
function trackGameOver() {
  umamiTrack('game_over');
}

/**
 * Track video start events
 * @param {number} videoNumber - The video number that is starting (1-4)
 */
function trackVideoStart(videoNumber) {
  umamiTrack(`video${videoNumber}_start`, { video: videoNumber });
}

/**
 * Track video 1 start
 */
function trackVideo1Start() {
  umamiTrack('video1_start', { video: 1 });
}

/**
 * Track video 2 start
 */
function trackVideo2Start() {
  umamiTrack('video2_start', { video: 2 });
}

/**
 * Track video 3 start
 */
function trackVideo3Start() {
  umamiTrack('video3_start', { video: 3 });
}

/**
 * Track video 4 start
 */
function trackVideo4Start() {
  umamiTrack('video4_start', { video: 4 });
}

/**
 * Track video complete events
 * @param {number} videoNumber - The video number that was completed (1-4)
 */
function trackVideoComplete(videoNumber) {
  umamiTrack(`video${videoNumber}_complete`, { video: videoNumber });
}

/**
 * Track video 1 complete
 */
function trackVideo1Complete() {
  umamiTrack('video1_complete', { video: 1 });
}

/**
 * Track video 2 complete
 */
function trackVideo2Complete() {
  umamiTrack('video2_complete', { video: 2 });
}

/**
 * Track video 3 complete
 */
function trackVideo3Complete() {
  umamiTrack('video3_complete', { video: 3 });
}

/**
 * Track video 4 complete
 */
function trackVideo4Complete() {
  umamiTrack('video4_complete', { video: 4 });
}

/**
 * Track video skip events
 * @param {number} videoNumber - The video number that was skipped (1-4)
 */
function trackVideoSkip(videoNumber) {
  umamiTrack(`video${videoNumber}_skip`, { video: videoNumber });
}

/**
 * Track video 1 skip
 */
function trackVideo1Skip() {
  umamiTrack('video1_skip', { video: 1 });
}

/**
 * Track video 2 skip
 */
function trackVideo2Skip() {
  umamiTrack('video2_skip', { video: 2 });
}

/**
 * Track video 3 skip
 */
function trackVideo3Skip() {
  umamiTrack('video3_skip', { video: 3 });
}

/**
 * Track video 4 skip
 */
function trackVideo4Skip() {
  umamiTrack('video4_skip', { video: 4 });
}

/**
 * Track menu action
 * @param {string} action - The menu action (e.g., 'settings_opened', 'quit_game')
 */
function trackMenuAction(action) {
  umamiTrack('menu_action', { action: action });
}

// Make functions available globally for Unity to call
if (typeof window !== 'undefined') {
  window.umamiTrack = umamiTrack;
  window.trackGameStart = trackGameStart;
  window.trackLevelStart = trackLevelStart;
  window.trackLevel1Start = trackLevel1Start;
  window.trackLevel2Start = trackLevel2Start;
  window.trackLevel3Start = trackLevel3Start;
  window.trackLevel4Start = trackLevel4Start;
  window.trackLevelComplete = trackLevelComplete;
  window.trackLevel1Complete = trackLevel1Complete;
  window.trackLevel2Complete = trackLevel2Complete;
  window.trackLevel3Complete = trackLevel3Complete;
  window.trackLevel4Complete = trackLevel4Complete;
  window.trackPlayerDeath = trackPlayerDeath;
  window.trackGameOver = trackGameOver;
  window.trackVideoStart = trackVideoStart;
  window.trackVideo1Start = trackVideo1Start;
  window.trackVideo2Start = trackVideo2Start;
  window.trackVideo3Start = trackVideo3Start;
  window.trackVideo4Start = trackVideo4Start;
  window.trackVideoComplete = trackVideoComplete;
  window.trackVideo1Complete = trackVideo1Complete;
  window.trackVideo2Complete = trackVideo2Complete;
  window.trackVideo3Complete = trackVideo3Complete;
  window.trackVideo4Complete = trackVideo4Complete;
  window.trackVideoSkip = trackVideoSkip;
  window.trackVideo1Skip = trackVideo1Skip;
  window.trackVideo2Skip = trackVideo2Skip;
  window.trackVideo3Skip = trackVideo3Skip;
  window.trackVideo4Skip = trackVideo4Skip;
  window.trackMenuAction = trackMenuAction;
}

console.log('[Umami] Game event tracking initialized');
