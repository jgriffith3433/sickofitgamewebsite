/**
 * Emoji Reactions System
 * 
 * Adds social emoji reactions to blog cards and paragraphs.
 * 
 * Usage: Add data-reaction-target="unique-id" to any element.
 * Cards (<a> wrapping .card) get a hover-triggered emoji button.
 * Paragraphs and other elements get an inline emoji bar.
 */

(function () {
  'use strict';

  // ── Emoji Categories ──────────────────────────────────────────────
  const EMOJI_CATEGORIES = {
    'Smileys': [
      '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊',
      '😋','😎','😍','🥰','😘','😗','😙','😚','🙂','🤗',
      '🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥',
      '😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜',
      '😝','🤤','😒','😓','😔','😕','🙃','🫠','🤑','😲',
      '🫣','😱','😳','🥺','🥹','😢','😭','😤','😠','😡',
      '🤬','🤯','😈','👿','💀','☠️','💩','🤡','👹','👺',
      '👻','👽','👾','🤖'
    ],
    'Gestures': [
      '👍','👎','👊','✊','🤛','🤜','👏','🙌','👐','🤲',
      '🤝','🙏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆',
      '👇','☝️','✋','🤚','🖐️','🖖','👋','🤏','💪','🦾',
      '🖕','✍️','🫶','🫰','🫳','🫴','🫱','🫲'
    ],
    'Hearts': [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
      '❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝',
      '💟','♥️','🩷','🩵','🩶'
    ],
    'Celebrate': [
      '🎉','🎊','🎈','🎁','🏆','🥇','🥈','🥉','🏅','🎖️',
      '🎯','🎪','🎨','🎬','🎤','🎧','🎵','🎶','🔥','⭐',
      '🌟','✨','💫','💥','💢','💯','🚀','⚡','☀️','🌈'
    ],
    'Animals': [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
      '🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧',
      '🐦','🐤','🦄','🐛','🦋','🐌','🐝','🐞','🦀','🐙',
      '🦖','🦕'
    ],
    'Food': [
      '🍕','🍔','🍟','🌭','🍿','🧀','🍗','🥩','🌮','🌯',
      '🍜','🍝','🍣','🍱','🍩','🍪','🎂','🍰','🧁','🍫',
      '🍬','🍭','🍺','🍻','🥂','🍷','☕','🧃','🥤','🧋'
    ],
    'Objects': [
      '💻','🖥️','⌨️','🖱️','🕹️','🎮','📱','📷','💡','🔧',
      '🔨','⚙️','🧲','💎','🪙','💰','📚','📖','✏️','🖊️',
      '📝','📌','📎','🔗','🔒','🔑','🗑️','📦','💣','🧨'
    ]
  };

  // ── User Identity ──────────────────────────────────────────────────
  function getReactorId() {
    const KEY = 'emoji_reactor_id';
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : 
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
      localStorage.setItem(KEY, id);
    }
    return id;
  }

  // ── State ──────────────────────────────────────────────────────────
  let activePickerEl = null;  // Currently open picker element
  let allTargets = [];        // All reaction target IDs on the page
  let reactionsCache = {};    // { targetId: { emoji: count } }
  let userReactionsCache = {};// { targetId: [emoji, ...] }

  // ── API Helpers ────────────────────────────────────────────────────

  async function fetchReactions(targetIds) {
    try {
      const params = new URLSearchParams();
      params.set('targets', targetIds.join(','));
      const resp = await fetch(`/api/reactions?${params}`, {
        headers: { 'X-Reactor-Id': getReactorId() },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      reactionsCache = { ...reactionsCache, ...data.reactions };
      userReactionsCache = { ...userReactionsCache, ...data.user_reactions };
    } catch (e) {
      console.error('Failed to fetch reactions:', e);
    }
  }

  async function sendReaction(targetId, emoji) {
    try {
      const resp = await fetch('/api/reactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Reactor-Id': getReactorId(),
        },
        body: JSON.stringify({ target_id: targetId, emoji }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.warn('Reaction failed:', err.error || resp.status);
        return null;
      }
      return await resp.json();
    } catch (e) {
      console.error('Failed to send reaction:', e);
      return null;
    }
  }

  // ── Picker UI ──────────────────────────────────────────────────────

  function createPicker(targetId, anchorEl) {
    // Close any existing picker
    closePicker();

    const picker = document.createElement('div');
    picker.className = 'emoji-picker';
    picker.setAttribute('data-picker-for', targetId);

    // Category tabs
    const tabBar = document.createElement('div');
    tabBar.className = 'emoji-tabs';
    const categories = Object.keys(EMOJI_CATEGORIES);
    categories.forEach((cat, i) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'emoji-tab' + (i === 0 ? ' active' : '');
      tab.textContent = EMOJI_CATEGORIES[cat][0]; // First emoji as tab icon
      tab.title = cat;
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        tabBar.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        showCategory(grid, cat);
      });
      tabBar.appendChild(tab);
    });
    picker.appendChild(tabBar);

    // Emoji grid
    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    picker.appendChild(grid);

    showCategory(grid, categories[0]);

    // Click handler for emojis (delegated)
    grid.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const btn = e.target.closest('.emoji-btn');
      if (!btn) return;
      const emoji = btn.dataset.emoji;
      if (!emoji) return;

      // Close picker immediately
      closePicker();

      // Optimistic update
      if (!reactionsCache[targetId]) reactionsCache[targetId] = {};
      if (!userReactionsCache[targetId]) userReactionsCache[targetId] = [];

      const wasReacted = userReactionsCache[targetId].includes(emoji);
      if (wasReacted) {
        reactionsCache[targetId][emoji] = (reactionsCache[targetId][emoji] || 1) - 1;
        if (reactionsCache[targetId][emoji] <= 0) delete reactionsCache[targetId][emoji];
        userReactionsCache[targetId] = userReactionsCache[targetId].filter(e => e !== emoji);
      } else {
        reactionsCache[targetId][emoji] = (reactionsCache[targetId][emoji] || 0) + 1;
        userReactionsCache[targetId].push(emoji);
      }
      renderReactionBadges(targetId);

      // Send to backend
      const result = await sendReaction(targetId, emoji);
      if (result) {
        reactionsCache[targetId] = result.reactions;
        renderReactionBadges(targetId);
      }
    });

    function showCategory(container, catName) {
      showEmojis(container, EMOJI_CATEGORIES[catName], targetId);
    }

    // Prevent any clicks inside the picker from bubbling out
    picker.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Position picker
    document.body.appendChild(picker);
    positionPicker(picker, anchorEl);
    activePickerEl = picker;

    // Close on outside click (deferred to avoid immediate close)
    setTimeout(() => {
      document.addEventListener('click', onOutsideClick);
    }, 0);
  }

  function showEmojis(container, emojis, targetId) {
    container.innerHTML = '';
    emojis.forEach(emoji => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-btn';
      btn.dataset.emoji = emoji;
      btn.textContent = emoji;
      btn.title = emoji;
      // Highlight if user already reacted with this
      if (userReactionsCache[targetId] && userReactionsCache[targetId].includes(emoji)) {
        btn.classList.add('reacted');
      }
      container.appendChild(btn);
    });
  }

  function positionPicker(picker, anchor) {
    const rect = anchor.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    let top = rect.bottom + scrollY + 8;
    let left = rect.left + scrollX;

    // Keep in viewport
    requestAnimationFrame(() => {
      const pickerRect = picker.getBoundingClientRect();
      if (left + pickerRect.width > window.innerWidth - 16) {
        left = window.innerWidth - pickerRect.width - 16 + scrollX;
      }
      if (left < 16) left = 16;
      if (top + pickerRect.height > window.innerHeight + scrollY - 16) {
        top = rect.top + scrollY - pickerRect.height - 8;
      }
      picker.style.top = top + 'px';
      picker.style.left = left + 'px';
    });
    picker.style.top = top + 'px';
    picker.style.left = left + 'px';
  }

  function closePicker() {
    if (activePickerEl) {
      activePickerEl.remove();
      activePickerEl = null;
    }
    document.removeEventListener('click', onOutsideClick);
  }

  function onOutsideClick(e) {
    if (activePickerEl && !activePickerEl.contains(e.target)) {
      closePicker();
    }
  }

  // ── Reaction Badges ────────────────────────────────────────────────

  function renderReactionBadges(targetId) {
    const container = document.querySelector(`.emoji-badges[data-badges-for="${targetId}"]`);
    if (!container) return;

    const reactions = reactionsCache[targetId] || {};
    const userReactions = userReactionsCache[targetId] || [];

    container.innerHTML = '';

    // Sort by count descending
    const sorted = Object.entries(reactions).sort((a, b) => b[1] - a[1]);

    sorted.forEach(([emoji, count]) => {
      if (count <= 0) return;
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'emoji-badge';
      if (userReactions.includes(emoji)) {
        badge.classList.add('user-reacted');
      }
      badge.innerHTML = `<span class="emoji-badge-icon">${emoji}</span><span class="emoji-badge-count">${count}</span>`;
      badge.title = `${emoji} ${count}`;
      badge.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Optimistic toggle
        const wasReacted = userReactions.includes(emoji);
        if (wasReacted) {
          reactionsCache[targetId][emoji] = (reactionsCache[targetId][emoji] || 1) - 1;
          if (reactionsCache[targetId][emoji] <= 0) delete reactionsCache[targetId][emoji];
          userReactionsCache[targetId] = userReactionsCache[targetId].filter(e => e !== emoji);
        } else {
          reactionsCache[targetId][emoji] = (reactionsCache[targetId][emoji] || 0) + 1;
          if (!userReactionsCache[targetId]) userReactionsCache[targetId] = [];
          userReactionsCache[targetId].push(emoji);
        }
        renderReactionBadges(targetId);

        const result = await sendReaction(targetId, emoji);
        if (result) {
          reactionsCache[targetId] = result.reactions;
          renderReactionBadges(targetId);
        }
      });
      container.appendChild(badge);
    });
  }

  // ── Initialize Elements ────────────────────────────────────────────

  function initReactable(el) {
    const targetId = el.getAttribute('data-reaction-target');
    if (!targetId) return;
    allTargets.push(targetId);

    // Make sure element has position for absolute children
    const pos = getComputedStyle(el).position;
    if (pos === 'static') {
      el.style.position = 'relative';
    }

    // Create the add-reaction button (emoji + plus)
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'emoji-add-btn';
    addBtn.innerHTML = '😀<span class="emoji-add-plus">+</span>';
    addBtn.title = 'Add reaction';
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      createPicker(targetId, addBtn);
    });

    // Create badges container
    const badges = document.createElement('div');
    badges.className = 'emoji-badges';
    badges.setAttribute('data-badges-for', targetId);

    // Check if this is a card link (blog index cards)
    const isCard = el.matches('a') && el.querySelector('.card');
    const isCardInner = el.matches('.card');

    if (isCard || isCardInner) {
      // For cards: button appears on hover at top-right
      addBtn.classList.add('emoji-add-btn-card');
      el.appendChild(addBtn);

      // Badges go at the bottom of the card body
      const cardBody = el.querySelector('.card-body');
      if (cardBody) {
        cardBody.appendChild(badges);
      } else {
        el.appendChild(badges);
      }
    } else {
      // For paragraphs/sections: button at the right side, badges below
      const wrapper = document.createElement('div');
      wrapper.className = 'emoji-reaction-wrap';

      // Insert wrapper after the element
      el.after(wrapper);
      wrapper.appendChild(badges);

      // Add button floats at the end
      addBtn.classList.add('emoji-add-btn-inline');
      el.appendChild(addBtn);
    }
  }

  // ── Boot ───────────────────────────────────────────────────────────

  async function init() {
    // Find all reactable elements
    const elements = document.querySelectorAll('[data-reaction-target]');
    elements.forEach(initReactable);

    if (allTargets.length === 0) return;

    // Fetch all reactions in one batch
    await fetchReactions(allTargets);

    // Render badges
    allTargets.forEach(renderReactionBadges);
  }

  // Expose a global function for dynamically-added elements
  window.emojiReactionsInit = async function(root) {
    const els = (root || document).querySelectorAll('[data-reaction-target]');
    const newTargets = [];
    els.forEach(el => {
      if (allTargets.includes(el.getAttribute('data-reaction-target'))) return;
      initReactable(el);
      newTargets.push(el.getAttribute('data-reaction-target'));
    });
    if (newTargets.length === 0) return;
    await fetchReactions(newTargets);
    newTargets.forEach(renderReactionBadges);
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
