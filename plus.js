/* Task examples use the main RoboMME page's styles and data/plus.json. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  let data;
  let playbackSpeed = 1;
  let comparisonsVisible = true;
  let subgoalsVisible = false;
  const subgoalPlayers = new WeakMap();
  const subgoalTracks = new Map();
  let referencePanel;
  const pendingGrids = new Set();

  function applyPlaybackSpeed(video) {
    video.defaultPlaybackRate = playbackSpeed;
    video.playbackRate = playbackSpeed;
  }

  // Measure natural content, then share section heights only within each grid row.
  // This keeps videos aligned after sample changes, resizing, or expanding a goal.
  function alignCards(grid) {
    if (!grid || pendingGrids.has(grid)) return;
    pendingGrids.add(grid);
    requestAnimationFrame(() => {
      pendingGrids.delete(grid);
      if (!grid.getClientRects().length) return;
      const rows = new Map();
      for (const card of grid.children) {
        const top = card.offsetTop;
        if (!rows.has(top)) rows.set(top, []);
        rows.get(top).push(card);
      }
      for (const cards of rows.values()) {
        for (const [name, selector] of [
          ['intro', '.plus-card-intro-content'],
          ['timeline', '.plus-timeline'],
          ['subgoal', '.plus-subgoal-content'],
          ['comparison', '.plus-task-comparison'],
        ]) {
          const height = Math.ceil(Math.max(0, ...cards.flatMap(card => $$(selector, card)).map(node => node.getBoundingClientRect().height)));
          const property = `--plus-${name}-height`;
          for (const card of cards) {
            if (card.style.getPropertyValue(property) !== `${height}px`) card.style.setProperty(property, `${height}px`);
          }
        }
      }
    });
  }
  const cardObserver = new ResizeObserver(entries => {
    entries.forEach(({ target }) => alignCards(target.closest('.task-grid')));
  });

  function renderInstruction(sample) {
    const instruction = make('div', 'task-instructions');
    const goal = sample.goal || '';
    const firstSentence = goal.length > 400 ? goal.indexOf('. ') + 1 : 0;
    const text = make('p');
    text.append(make('strong', '', 'Instruction: '), document.createTextNode(firstSentence ? goal.slice(0, firstSentence) : goal));
    instruction.append(text);
    if (firstSentence) {
      const details = make('details', 'plus-instruction-details');
      details.append(make('summary', '', 'More details'), make('p', '', goal.slice(firstSentence).trim()));
      instruction.append(details);
    }
    return instruction;
  }

  function loadSubgoals(url) {
    if (!subgoalTracks.has(url)) {
      subgoalTracks.set(url, fetch(url).then(response => {
        if (!response.ok) throw new Error(`Subgoals request failed (${response.status})`);
        return response.json();
      }).then(track => {
        if (!(track.fps > 0) || !Number.isInteger(track.frame_count) || track.frame_count < 1
            || !Array.isArray(track.cues) || track.cues[0]?.[0] !== 0
            || !track.cues.every(([frame, text], index) => Number.isInteger(frame)
              && frame >= 0 && frame < track.frame_count && typeof text === 'string'
              && (!index || frame > track.cues[index - 1][0]))) {
          throw new Error('Invalid grounded subgoal timeline');
        }
        return track;
      }).catch(error => {
        subgoalTracks.delete(url);
        throw error;
      }));
    }
    return subgoalTracks.get(url);
  }

  function attachSubgoals(video, sample, task) {
    const slot = make('div', 'plus-subgoal-slot');
    slot.id = `subgoal-${task.id}`;
    const content = make('div', 'plus-subgoal-content');
    const caption = make('p', 'plus-subgoal-text', 'Loading subgoal…');
    content.append(make('span', 'plus-subgoal-label', 'Grounded subgoal'), caption);
    slot.append(content);
    let track, loading, callback, visible = false, disposed = false;

    const update = (time = video.currentTime) => {
      if (!visible || !track || disposed) return;
      const frame = Math.max(0, Math.min(track.frame_count - 1, Math.floor(time * track.fps + 0.0001)));
      // Find the last change at or before this displayed frame, including after a backward seek.
      let low = 0, high = track.cues.length;
      while (low + 1 < high) {
        const mid = Math.floor((low + high) / 2);
        if (track.cues[mid][0] <= frame) low = mid;
        else high = mid;
      }
      const raw = track.cues[low][1];
      const empty = !raw.trim() || /^(NO RECORD|Unknown|None)$/i.test(raw.trim());
      const text = empty ? 'No recorded subgoal for this frame.' : raw;
      if (caption.textContent !== text) caption.textContent = text;
      content.classList.toggle('is-empty', empty);
      slot.dataset.frame = String(frame);
    };
    const stopFrames = () => {
      if (callback !== undefined) video.cancelVideoFrameCallback(callback);
      callback = undefined;
    };
    const followFrames = () => {
      if (callback !== undefined || !visible || !track || disposed || video.paused
          || video.ended || !video.isConnected || !video.requestVideoFrameCallback) return;
      callback = video.requestVideoFrameCallback((_, metadata) => {
        callback = undefined;
        update(metadata.mediaTime);
        followFrames();
      });
    };
    const onPositionChange = () => { update(); followFrames(); };
    video.addEventListener('playing', onPositionChange);
    video.addEventListener('loadedmetadata', onPositionChange);
    video.addEventListener('seeking', onPositionChange);
    video.addEventListener('seeked', onPositionChange);
    video.addEventListener('pause', () => { stopFrames(); update(); });
    video.addEventListener('ended', () => { stopFrames(); update(); });
    video.addEventListener('timeupdate', () => {
      if (!video.requestVideoFrameCallback || video.paused || video.seeking) update();
    });
    const setVisible = value => {
      visible = value;
      slot.hidden = !value;
      if (value) {
        if (!sample.subgoals) caption.textContent = 'No recorded subgoals for this video.';
        else if (!track && !loading) {
          caption.textContent = 'Loading subgoal…';
          loading = loadSubgoals(sample.subgoals).then(result => {
            track = result;
            if (!disposed) { update(); followFrames(); }
          }).catch(() => {
            if (!disposed) caption.textContent = 'Subgoals could not be loaded. Toggle off and on to retry.';
          }).finally(() => { loading = null; });
        }
        update();
        followFrames();
      } else stopFrames();
      alignCards(video.closest('.task-grid'));
    };
    subgoalPlayers.set(video, {
      setVisible,
      dispose() { disposed = true; stopFrames(); cardObserver.unobserve(content); },
    });
    cardObserver.observe(content);
    setVisible(subgoalsVisible);
    return slot;
  }

  function setupReferencePanel() {
    const panel = make('dialog', 'plus-reference-panel');
    panel.id = 'robomme-example';
    panel.setAttribute('aria-labelledby', 'robomme-example-title');
    const header = make('div', 'plus-reference-header');
    header.title = 'Drag to move';
    const heading = make('div');
    const title = make('h2');
    title.id = 'robomme-example-title';
    heading.append(make('p', 'plus-reference-kicker', 'RoboMME original sample'), title);
    const closeButton = make('button', 'plus-reference-close', '×');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close RoboMME original sample');
    header.append(heading, closeButton);
    const body = make('div', 'plus-reference-body');
    panel.append(header, body);
    document.body.append(panel);

    let activeTask, trigger, video, drag;
    const position = (left, top) => {
      const bounds = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(12, Math.min(left, window.innerWidth - bounds.width - 12))}px`;
      panel.style.top = `${Math.max(12, Math.min(top, window.innerHeight - bounds.height - 12))}px`;
    };
    const stopVideo = () => {
      if (!video) return;
      video.pause();
      video.removeAttribute('src');
      video.load();
      video = null;
    };
    const close = (restoreFocus = true) => {
      if (!panel.open) return;
      stopVideo();
      panel.close();
      body.replaceChildren();
      trigger?.setAttribute('aria-expanded', 'false');
      if (restoreFocus) trigger?.focus({ preventScroll: true });
      activeTask = trigger = drag = null;
      header.classList.remove('is-dragging');
    };
    closeButton.addEventListener('click', () => close());
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && panel.open) {
        event.preventDefault();
        close();
      }
    });
    header.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button')) return;
      const bounds = panel.getBoundingClientRect();
      drag = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      header.setPointerCapture(event.pointerId);
      header.classList.add('is-dragging');
    });
    header.addEventListener('pointermove', event => {
      if (drag) position(event.clientX - drag.x, event.clientY - drag.y);
    });
    const stopDragging = () => { drag = null; header.classList.remove('is-dragging'); };
    header.addEventListener('pointerup', stopDragging);
    header.addEventListener('pointercancel', stopDragging);
    header.addEventListener('lostpointercapture', stopDragging);
    window.addEventListener('resize', () => {
      if (!panel.open) return;
      const bounds = panel.getBoundingClientRect();
      position(bounds.left, bounds.top);
    });

    return {
      get task() { return activeTask; },
      close,
      open(task, button) {
        if (activeTask === task) { close(); return; }
        stopVideo();
        trigger?.setAttribute('aria-expanded', 'false');
        activeTask = task;
        trigger = button;
        trigger.setAttribute('aria-expanded', 'true');
        title.textContent = task.name;
        const example = task.robomme_example;
        video = make('video', 'plus-reference-video');
        video.controls = true;
        video.playsInline = true;
        video.muted = true;
        video.loop = true;
        video.preload = 'metadata';
        applyPlaybackSpeed(video);
        video.addEventListener('loadedmetadata', event => applyPlaybackSpeed(event.currentTarget));
        video.src = example.video;
        video.setAttribute('aria-label', `RoboMME ${task.name} sample`);
        video.addEventListener('error', () => {
          const message = make('p', 'plus-video-error', 'Unable to play this video. ');
          const link = make('a', '', 'Open the MP4');
          link.href = example.video;
          message.append(link);
          body.append(message);
        }, { once: true });
        body.replaceChildren(renderInstruction(example), video);
        if (example.caption) body.append(make('p', 'plus-reference-caption', example.caption));
        // Non-modal: the RoboMME-Plus video and sample controls remain usable alongside it.
        if (!panel.open) panel.show();
        const card = button.closest('.task-card').getBoundingClientRect();
        const bounds = panel.getBoundingClientRect();
        const placeOnRight = card.left + card.width / 2 < window.innerWidth / 2;
        position(placeOnRight ? window.innerWidth - bounds.width - 16 : 16, window.innerHeight - bounds.height - 16);
        closeButton.focus({ preventScroll: true });
        video.play().catch(() => { /* Native controls allow a manual start. */ });
      },
    };
  }

  function renderSample(task, sample) {
    const figure = make('figure', 'plus-sample');
    figure.setAttribute('role', 'group');
    figure.setAttribute('aria-label', `${task.name}, ${sample.label}`);
    if (sample.video) {
      const cameraLabels = make('div', 'plus-camera-labels');
      cameraLabels.append(make('span', '', 'Front camera'), make('span', '', 'Wrist camera'));
      const video = make('video');
      video.controls = false;
      video.playsInline = true;
      video.preload = 'none';
      video.addEventListener('loadedmetadata', event => applyPlaybackSpeed(event.currentTarget));
      video.setAttribute('aria-label', `${task.name}, ${sample.label} RoboMME-Plus example`);
      if (sample.poster) video.poster = sample.poster;
      const source = make('source');
      source.src = sample.video;
      source.type = 'video/mp4';
      video.append(source, document.createTextNode('Your browser does not support the video tag.'));
      const frame = make('div', 'plus-video-frame');
      const playButton = make('button', 'plus-play', '▶');
      playButton.type = 'button';
      playButton.setAttribute('aria-label', `Play ${task.name}, ${sample.label}`);
      playButton.addEventListener('click', () => {
        video.controls = true;
        playButton.hidden = true;
        video.play().catch(() => { playButton.hidden = false; });
      });
      frame.append(video, playButton);
      video.addEventListener('play', () => {
        video.controls = true;
        playButton.hidden = true;
        $$('.plus-samples video').forEach(other => { if (other !== video && !other.paused) other.pause(); });
      });
      video.addEventListener('error', () => {
        const message = make('p', 'plus-video-error', 'Unable to play this video. ');
        const link = make('a', '', 'Open the MP4');
        link.href = sample.video;
        message.append(link);
        figure.append(message);
      }, { once: true });
      const timeline = make('div', 'plus-timeline');
      const phase = make('span', 'plus-phase');
      const demoSeconds = sample.demonstration_seconds || 0;
      const updatePhase = () => {
        phase.textContent = demoSeconds && video.currentTime < demoSeconds ? 'Demonstration' : 'Execution';
      };
      video.addEventListener('timeupdate', updatePhase);
      updatePhase();
      timeline.append(phase);
      if (demoSeconds) {
        const jump = make('button', 'plus-jump', 'Jump to execution →');
        jump.type = 'button';
        jump.setAttribute('aria-label', `Jump to execution for ${task.name}, ${sample.label}`);
        jump.addEventListener('click', () => {
          video.controls = true;
          playButton.hidden = true;
          // Seek just past the boundary so browser rounding cannot leave us in the demo.
          const seek = () => { video.currentTime = demoSeconds + 0.001; updatePhase(); };
          if (video.readyState >= 1) seek();
          else { video.addEventListener('loadedmetadata', seek, { once: true }); video.load(); }
        });
        timeline.append(jump);
      }
      const minutes = Math.floor(sample.duration_seconds / 60);
      const seconds = String(Math.floor(sample.duration_seconds % 60)).padStart(2, '0');
      timeline.append(make('span', 'plus-duration', `${minutes}:${seconds} at 1×`));
      const timelineSlot = make('div', 'plus-timeline-slot');
      timelineSlot.append(timeline);
      figure.append(attachSubgoals(video, sample, task), cameraLabels, frame, timelineSlot);
    } else {
      const placeholder = make('div', 'video-placeholder');
      placeholder.setAttribute('role', 'img');
      placeholder.setAttribute('aria-label', `${task.name}, ${sample.label}: video coming soon`);
      const icon = make('span', 'icon');
      icon.setAttribute('aria-hidden', 'true');
      icon.append(make('i', 'far fa-circle-play'));
      placeholder.append(icon, make('p', '', 'Video coming soon'));
      figure.append(placeholder);
    }
    return figure;
  }

  function renderCarousel(task, title) {
    const carousel = make('div', 'plus-carousel');
    const intro = make('div', 'plus-card-intro');
    const introContent = make('div', 'plus-card-intro-content');
    const instruction = make('div');
    const heading = make('div', 'plus-card-heading');
    heading.append(make('h3', 'task-name', title));
    if (task.robomme_example) {
      const exampleButton = make('button', 'plus-reference-bubble', '▶ RoboMME original sample');
      exampleButton.type = 'button';
      exampleButton.setAttribute('aria-label', `Show RoboMME original sample for ${task.name}`);
      exampleButton.setAttribute('aria-haspopup', 'dialog');
      exampleButton.setAttribute('aria-controls', 'robomme-example');
      exampleButton.setAttribute('aria-expanded', 'false');
      exampleButton.addEventListener('click', () => referencePanel.open(task, exampleButton));
      heading.append(exampleButton);
    }
    introContent.append(heading, instruction);
    intro.append(introContent);
    const samples = make('div', 'plus-samples');
    samples.id = `samples-${task.id}`;
    const comparisonSlot = make('div', 'plus-comparison-slot');
    comparisonSlot.id = `comparison-${task.id}`;
    comparisonSlot.hidden = !comparisonsVisible;
    const comparison = make('dl', 'plus-task-comparison');
    comparisonSlot.append(comparison);

    const controls = make('div', 'plus-sample-controls');
    const previous = make('button', 'plus-sample-arrow', '‹');
    const next = make('button', 'plus-sample-arrow', '›');
    const label = make('span', 'plus-sample-label');
    label.setAttribute('aria-live', 'polite');
    label.setAttribute('aria-atomic', 'true');
    [previous, next].forEach((button, index) => {
      button.type = 'button';
      button.setAttribute('aria-label', `${index ? 'Next' : 'Previous'} sample for ${task.name}`);
      button.setAttribute('aria-controls', samples.id);
      button.disabled = task.samples.length < 2;
    });

    let current = 0;
    const showSample = index => {
      current = (index + task.samples.length) % task.samples.length;
      const sample = task.samples[current];
      $$('video', samples).forEach(video => {
        if (!video.paused) video.pause();
        subgoalPlayers.get(video)?.dispose();
      });
      instruction.replaceChildren(renderInstruction(sample));
      samples.replaceChildren(renderSample(task, sample));
      const level = sample.difficulty;
      label.textContent = level
        ? `${sample.label} (${level[0].toUpperCase()}${level.slice(1)})`
        : sample.method ? `${sample.label} · ${current + 1} / ${task.samples.length}` : sample.label;
      const setup = task.comparisons?.[level] || task.comparison;
      comparison.replaceChildren();
      if (setup) {
        for (const [name, text] of [['RoboMME', setup.robomme], ['RoboMME-Plus', setup.plus]]) {
          const row = make('div');
          row.append(make('dt', '', name), make('dd', '', text));
          comparison.append(row);
        }
      }
      alignCards(carousel.closest('.task-grid'));
    };
    previous.addEventListener('click', () => showSample(current - 1));
    next.addEventListener('click', () => showSample(current + 1));
    controls.append(previous, label, next);
    carousel.append(intro, samples, controls, comparisonSlot);
    cardObserver.observe(introContent);
    cardObserver.observe(comparison);
    showSample(Math.max(0, task.samples.findIndex(sample => sample.difficulty === 'medium')));
    return carousel;
  }

  function activateSuite(id, focus = false) {
    if (!data.suites.some(suite => suite.id === id)) return;
    if (referencePanel.task && referencePanel.task.suite !== id) referencePanel.close(false);
    $$('#suite-tabs [role="tab"]').forEach(tab => {
      const selected = tab.dataset.suite === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.classList.toggle('active', selected);
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    $$('#task-panels [role="tabpanel"]').forEach(panel => {
      const selected = panel.id === `tasks-${id}`;
      panel.hidden = !selected;
      panel.classList.toggle('active', selected);
      if (selected) alignCards($('.task-grid', panel));
      if (!selected) $$('video', panel).forEach(video => { if (!video.paused) video.pause(); });
    });
  }

  function handleTaskLink() {
    let hash;
    try { hash = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
    const suite = data.suites.find(item => `tasks-${item.id}` === hash);
    const task = data.tasks.find(item => `task-${item.id}` === hash);
    if (!suite && !task) return;
    activateSuite(suite ? suite.id : task.suite);
    requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView());
  }

  function renderExamples() {
    const tabs = $('#suite-tabs');
    const panels = $('#task-panels');
    panels.replaceChildren();
    data.suites.forEach((suite, suiteIndex) => {
      const tab = make('button', 'task-tab', `Task Suite ${suiteIndex + 1}: ${suite.name}`);
      tab.type = 'button';
      tab.id = `tab-${suite.id}`;
      tab.dataset.suite = suite.id;
      tab.title = `${suite.memory} · ${suite.description}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `tasks-${suite.id}`);
      tab.addEventListener('click', () => activateSuite(suite.id));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const last = data.suites.length - 1;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? last
          : (suiteIndex + (event.key === 'ArrowRight' ? 1 : last)) % data.suites.length;
        activateSuite(data.suites[next].id, true);
      });
      tabs.append(tab);

      const panel = make('div', 'tab-content');
      panel.id = `tasks-${suite.id}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      const list = make('div', 'task-grid');
      data.tasks.filter(task => task.suite === suite.id).forEach((task, taskIndex) => {
        const article = make('article', 'task-card');
        article.id = `task-${task.id}`;
        article.append(renderCarousel(task, `Task ${suiteIndex + 1}.${taskIndex + 1}: ${task.name}`));
        list.append(article);
      });
      panel.append(list);
      panels.append(panel);
      cardObserver.observe(list);
    });
    activateSuite(data.suites[0].id);
    handleTaskLink();
    window.addEventListener('hashchange', handleTaskLink);
  }

  function setupNavigation() {
    const burger = $('.navbar-burger');
    const toggleMenu = () => {
      const expanded = burger.getAttribute('aria-expanded') !== 'true';
      burger.setAttribute('aria-expanded', String(expanded));
      burger.classList.toggle('is-active', expanded);
      $('#navMenu').classList.toggle('is-active', expanded);
    };
    burger.tabIndex = 0;
    burger.setAttribute('aria-controls', 'navMenu');
    burger.addEventListener('click', toggleMenu);
    burger.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleMenu(); }
    });
    const nav = $('#sectionNav');
    const links = $$('.section-nav-link[data-target]');
    const sections = links.map(link => document.getElementById(link.dataset.target));
    const updateNavigation = () => {
      const navHeight = nav.offsetHeight;
      nav.classList.toggle('visible', $('#overview').getBoundingClientRect().top <= navHeight);
      const current = sections.filter(section => section.getBoundingClientRect().top <= navHeight + 60).at(-1);
      links.forEach(link => link.classList.toggle('active', current?.id === link.dataset.target));
    };
    links.forEach(link => link.addEventListener('click', event => {
      event.preventDefault();
      const target = document.getElementById(link.dataset.target);
      const top = target.getBoundingClientRect().top + window.scrollY - nav.offsetHeight;
      window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }));
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { updateNavigation(); ticking = false; });
    }, { passive: true });
    updateNavigation();
  }

  async function init() {
    if (location.hash === '#plus-leaderboard') {
      location.replace('leaderboard.html?benchmark=plus');
      return;
    }
    setupNavigation();
    const teaser = $('#plus-teaser');
    if (teaser) {
      teaser.defaultPlaybackRate = 1.5;
      teaser.playbackRate = 1.5;
    }
    $('#toggle-comparisons').addEventListener('click', event => {
      comparisonsVisible = !comparisonsVisible;
      event.currentTarget.textContent = comparisonsVisible ? 'Hide comparisons' : 'Show comparisons';
      event.currentTarget.setAttribute('aria-expanded', String(comparisonsVisible));
      $$('.plus-comparison-slot').forEach(slot => { slot.hidden = !comparisonsVisible; });
      $$('#task-panels .task-grid').forEach(alignCards);
    });
    $('#playback-speed').addEventListener('change', event => {
      playbackSpeed = Number(event.target.value);
      $$('.plus-samples video, .plus-reference-video').forEach(applyPlaybackSpeed);
    });
    $('#toggle-subgoals').addEventListener('click', event => {
      subgoalsVisible = !subgoalsVisible;
      event.currentTarget.textContent = subgoalsVisible ? 'Hide grounded subgoals' : 'Show grounded subgoals';
      event.currentTarget.setAttribute('aria-expanded', String(subgoalsVisible));
      $$('.plus-samples video').forEach(video => subgoalPlayers.get(video)?.setVisible(subgoalsVisible));
      $$('#task-panels .task-grid').forEach(alignCards);
    });
    try {
      const response = await fetch('data/plus.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Data request failed (${response.status})`);
      data = await response.json();
      referencePanel = setupReferencePanel();
      renderExamples();
      $('#toggle-comparisons').setAttribute('aria-controls', data.tasks.map(task => `comparison-${task.id}`).join(' '));
      $('#toggle-subgoals').setAttribute('aria-controls', data.tasks.map(task => `subgoal-${task.id}`).join(' '));
    } catch (error) {
      $('#task-panels').replaceChildren(make('p', 'has-text-centered', 'Task examples could not be loaded. Please refresh the page to try again.'));
      console.error('Unable to load RoboMME-Plus:', error);
    }
  }
  init();
})();
