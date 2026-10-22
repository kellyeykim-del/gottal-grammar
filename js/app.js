// 강의 시청 + 확인 테스트 앱 본체. 로그인 후 main.js가 GottalApp.start(ctx)로 시작한다.
//  ctx = { isTeacher, initialState, persist(state, summary, immediate), onAttempt(attempt) }
window.GottalApp = { start(ctx) {
  'use strict';

  const PLAYLIST_ID = 'PL_Dpt0EBpdN4e5pPoRnkUXkuvrTqWKJlv';
  const WATCH_DONE_RATIO = 0.85; // 영상의 85% 이상 시청하면 "시청 완료"
  const PASS_RATE = window.APP_CONFIG.PASS_RATE;

  const LECS = (window.LECTURES || []).map((l, idx) => ({ ...l, idx }));
  const byId = Object.fromEntries(LECS.map((l) => [l.id, l]));

  // ---------------------------------------------------------------- state
  const defaultState = () => ({
    lectures: {},          // id -> { seen, duration, manual, best, passed, attempts }
    wrong: {},             // "id#q" -> { id, q, ts }
    current: null,
  });
  // 선생님은 모든 강의를 자유롭게 미리 볼 수 있다
  const settings = { freeMode: !!ctx.isTeacher, passRate: PASS_RATE };
  const passText = (rate) => (rate >= 100 ? '모두 맞혀야 통과' : `${rate}% 이상 통과`);

  const init = ctx.initialState || {};
  let state = { ...defaultState(), lectures: init.lectures || {}, wrong: init.wrong || {}, current: init.current || null };

  function summary() {
    return { passed: LECS.filter((l) => state.lectures[l.id]?.passed).length, wrong: Object.keys(state.wrong).length };
  }
  function save(immediate = false) {
    ctx.persist(state, summary(), immediate);
  }
  function rec(id) {
    if (!state.lectures[id]) state.lectures[id] = { seen: '', duration: 0, manual: false, best: null, passed: false, attempts: 0 };
    return state.lectures[id];
  }

  // ---------------------------------------------------------------- helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtQ = (s) => esc(s).replace(/_{3,}/g, '<span class="blank">＿＿＿</span>');
  const lenToSec = (len) => len.split(':').reduce((a, b) => a * 60 + Number(b), 0);
  const norm = (s) => String(s).toLowerCase().replace(/[’‘`´]/g, "'").replace(/[.?!,]/g, '').replace(/\s+/g, ' ').trim();
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function seenCount(r) { let n = 0; for (const c of r.seen || '') if (c === '1') n++; return n; }
  function watchRatio(lec) {
    const r = rec(lec.id);
    const dur = r.duration || lenToSec(lec.len);
    return dur ? Math.min(1, seenCount(r) / dur) : 0;
  }
  const isWatched = (lec) => { const r = state.lectures[lec.id]; return !!r && (r.manual || r.passed || watchRatio(lec) >= WATCH_DONE_RATIO); };
  const isPassed = (lec) => !!state.lectures[lec.id]?.passed;
  const isUnlocked = (lec) => settings.freeMode || lec.idx === 0 || isPassed(lec) || isPassed(LECS[lec.idx - 1]);
  const canQuiz = (lec) => settings.freeMode || isWatched(lec);

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------------------------------------------------------------- header / sidebar
  function renderHeader() {
    const passed = LECS.filter(isPassed).length;
    $('#overallText').textContent = `${passed} / ${LECS.length} 강 통과`;
    $('#overallBar').style.width = `${(passed / LECS.length) * 100}%`;
    const wc = Object.keys(state.wrong).length;
    const badge = $('#wrongCount');
    badge.textContent = wc;
    badge.classList.toggle('zero', wc === 0);
    $('#sidebarHint').textContent = settings.freeMode
      ? '자유 모드: 모든 강의가 열려 있어요'
      : `순서대로 테스트를 ${settings.passRate >= 100 ? '모두 맞혀야' : `${settings.passRate}% 이상 맞혀야`} 다음 강의가 열려요`;
  }

  function renderSidebar() {
    const list = $('#lectureList');
    let html = '';
    let section = null;
    for (const lec of LECS) {
      if (lec.section !== section) {
        section = lec.section;
        const inSec = LECS.filter((l) => l.section === section);
        const done = inSec.filter(isPassed).length;
        html += `<div class="section-title"><span>${esc(section)}</span><span class="muted">${done}/${inSec.length}</span></div>`;
      }
      const r = state.lectures[lec.id];
      const unlocked = isUnlocked(lec);
      let cls = '', mark = esc(lec.no);
      if (isPassed(lec)) { cls = 'passed'; mark = '✓'; }
      else if (!unlocked) { cls = 'locked'; mark = '🔒'; }
      else if (r?.attempts) cls = 'tried';
      else if (isWatched(lec)) cls = 'watched';
      let sub = lec.len;
      if (r?.best != null) sub += ` · 최고 ${r.best}%`;
      else if (isWatched(lec)) sub += ' · 시청 완료';
      else if (r && seenCount(r)) sub += ` · ${Math.round(watchRatio(lec) * 100)}% 시청`;
      const active = state.current === lec.id && currentView === 'lecture' ? ' active' : '';
      html += `<button class="lec-item${active}" data-id="${lec.id}" ${unlocked ? '' : 'disabled'}>
        <span class="lec-status ${cls}">${mark}</span>
        <span class="lec-meta"><span class="lec-name">[${esc(lec.no)}] ${esc(lec.title)}</span><span class="lec-sub">${esc(sub)}</span></span>
      </button>`;
    }
    list.innerHTML = html;
  }

  function scrollActiveIntoView() {
    const a = $('.lec-item.active');
    if (a) a.scrollIntoView({ block: 'nearest' });
  }

  $('#lectureList').addEventListener('click', (e) => {
    const b = e.target.closest('.lec-item');
    if (!b || b.disabled) return;
    openLecture(b.dataset.id);
    closeDrawer();
  });

  function openDrawer() { $('#sidebar').classList.add('open'); $('#scrim').classList.add('open'); }
  function closeDrawer() { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('open'); }
  $('#menuBtn').addEventListener('click', openDrawer);
  $('#scrim').addEventListener('click', closeDrawer);

  // ---------------------------------------------------------------- YouTube player
  // 영상은 앱 안에서만 본다: YouTube 자체 컨트롤/링크는 끄고, 투명 막(shield)으로 영상 위 클릭을 막은 뒤
  // 재생·탐색·배속·음소거·전체화면은 앱의 자체 컨트롤로 제공한다.
  let player = null;
  let playerFor = null;
  let lastT = null;
  let saveTick = 0;
  let seeking = false;
  let lastState = -1;

  window.onYouTubeIframeAPIReady = () => {
    if (currentView === 'lecture' && state.current) mountPlayer(byId[state.current]);
  };

  function destroyPlayer() {
    if (player && player.destroy) { try { player.destroy(); } catch (e) { /* ignore */ } }
    player = null; playerFor = null; lastT = null; lastState = -1;
  }

  function mountPlayer(lec) {
    const host = $('#ytPlayer');
    if (!host) return;
    if (!window.YT || !YT.Player) return; // API 로딩 후 onYouTubeIframeAPIReady에서 다시 호출
    destroyPlayer();
    playerFor = lec.id;
    player = new YT.Player('ytPlayer', {
      videoId: lec.id,
      playerVars: {
        controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, modestbranding: 1,
        iv_load_policy: 3, cc_load_policy: 0, origin: location.origin,
      },
      events: {
        onReady: () => updateControls(),
        onStateChange: (ev) => {
          lastState = ev.data;
          if (ev.data !== 1) lastT = null;
          if (ev.data === 0) { save(); updateWatchUI(lec); }
          updateControls();
        },
      },
    });
    bindControls();
  }

  const fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function playerCall(fn, ...args) {
    if (!player || typeof player[fn] !== 'function') return undefined;
    try { return player[fn](...args); } catch (e) { return undefined; }
  }

  function togglePlay() {
    const st = playerCall('getPlayerState');
    if (st === 1 || st === 3) { playerCall('pauseVideo'); return; }
    if (st === 0) playerCall('seekTo', 0, true);
    playerCall('playVideo');
    // 일부 모바일 브라우저는 소리 있는 재생을 막는다 → 음소거로 재생하고 안내
    setTimeout(() => {
      const s = playerCall('getPlayerState');
      if (s !== 1 && s !== 3 && !playerCall('isMuted')) {
        playerCall('mute');
        playerCall('playVideo');
        toast('🔇 음소거로 재생했어요. 소리 버튼을 눌러 소리를 켜세요.');
        setTimeout(updateControls, 300);
      }
    }, 1500);
  }

  function toggleFullscreen() {
    const wrap = $('#playerWrap');
    if (!wrap) return;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (wrap.requestFullscreen || wrap.webkitRequestFullscreen)?.call(wrap);
  }

  function bindControls() {
    $('#playerShield').addEventListener('click', togglePlay);
    $('#playerShield').addEventListener('dblclick', toggleFullscreen);
    $('#playerShield').addEventListener('contextmenu', (e) => e.preventDefault());
    $('#pcPlay').addEventListener('click', togglePlay);
    $('#pcBack').addEventListener('click', () => { lastT = null; playerCall('seekTo', Math.max(0, (playerCall('getCurrentTime') || 0) - 10), true); });
    $('#pcMute').addEventListener('click', () => { playerCall(playerCall('isMuted') ? 'unMute' : 'mute'); setTimeout(updateControls, 100); });
    $('#pcSpeed').addEventListener('change', (e) => playerCall('setPlaybackRate', Number(e.target.value)));
    const fsBtn = $('#pcFull');
    if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) fsBtn.hidden = true;
    fsBtn.addEventListener('click', toggleFullscreen);
    const seek = $('#pcSeek');
    seek.addEventListener('input', () => { seeking = true; $('#pcTime').textContent = `${fmtTime(seek.value)} / ${fmtTime(seek.max)}`; });
    seek.addEventListener('change', () => { seeking = false; lastT = null; playerCall('seekTo', Number(seek.value), true); });
  }

  function updateControls() {
    if (!$('#pcPlay')) return;
    const st = playerCall('getPlayerState');
    const playing = st === 1 || st === 3;
    $('#pcPlay').textContent = playing ? '❚❚' : st === 0 ? '↻' : '▶';
    $('#pcPlay').setAttribute('aria-label', playing ? '일시정지' : '재생');
    const shield = $('#playerShield');
    shield.classList.toggle('paused', !playing);
    $('#bigPlay').textContent = st === 0 ? '↻' : '▶';
    const d = playerCall('getDuration') || 0;
    const t = playerCall('getCurrentTime') || 0;
    const seek = $('#pcSeek');
    if (d > 0) seek.max = Math.floor(d);
    if (!seeking) {
      seek.value = Math.floor(t);
      $('#pcTime').textContent = `${fmtTime(t)} / ${fmtTime(d)}`;
    }
    $('#pcMute').textContent = playerCall('isMuted') ? '🔇' : '🔊';
  }

  setInterval(() => {
    if (!player || !player.getPlayerState || !playerFor) return;
    let st;
    try { st = player.getPlayerState(); } catch (e) { return; }
    updateControls();
    if (st !== 1) { lastT = null; return; }
    const lec = byId[playerFor];
    const r = rec(lec.id);
    const before = isWatched(lec);
    const t = player.getCurrentTime();
    const d = Math.round(player.getDuration() || 0);
    if (d > 0 && r.duration !== d) r.duration = d;
    const total = r.duration || lenToSec(lec.len);
    if (r.seen.length < total) r.seen = r.seen.padEnd(total, '0');
    // 정상 재생(배속 포함)으로 지나간 구간만 시청으로 인정. 건너뛰기(seek)는 제외.
    if (lastT != null && t >= lastT && t - lastT <= 3.5) {
      const arr = r.seen.split('');
      for (let s = Math.floor(lastT); s <= Math.floor(t) && s < total; s++) arr[s] = '1';
      r.seen = arr.join('');
    }
    lastT = t;
    updateWatchUI(lec);
    if (!before && isWatched(lec)) {
      save();
      toast('시청 완료! 이제 확인 테스트를 풀 수 있어요 ✍️');
      renderSidebar();
    }
    if (++saveTick % 5 === 0) {
      save();
      const sub = document.querySelector(`.lec-item[data-id="${lec.id}"] .lec-sub`);
      if (sub && r.best == null && !isWatched(lec)) sub.textContent = `${lec.len} · ${Math.round(watchRatio(lec) * 100)}% 시청`;
    }
  }, 1000);

  function updateWatchUI(lec) {
    const pct = Math.round(watchRatio(lec) * 100);
    const done = isWatched(lec);
    const label = $('#watchPct');
    if (!label) return;
    label.textContent = done ? `시청 완료 ✓` : `${pct}%`;
    const fill = $('#watchFill');
    fill.style.width = `${done ? 100 : pct}%`;
    fill.classList.toggle('done', done);
    const startBtn = $('#startQuizBtn');
    if (startBtn) startBtn.disabled = !canQuiz(lec);
    const gateText = $('#gateText');
    if (gateText) gateText.textContent = gateMessage(lec);
  }

  function gateMessage(lec) {
    if (ctx.isTeacher) return '선생님 계정은 강의를 듣지 않아도 바로 테스트를 볼 수 있어요. (선생님의 응시 결과는 학생 기록에 포함되지 않아요)';
    if (canQuiz(lec)) return isPassed(lec) ? '이미 통과한 강의예요. 복습 삼아 다시 풀어봐도 좋아요.' : '강의를 다 들었다면 확인 테스트를 풀어보세요!';
    return `위 영상을 ${Math.round(WATCH_DONE_RATIO * 100)}% 이상 시청하면 테스트가 열려요. (건너뛴 구간은 시청으로 치지 않아요)`;
  }

  // ---------------------------------------------------------------- views
  let currentView = 'lecture';

  function openLecture(id, opts = {}) {
    const lec = byId[id];
    if (!lec) return;
    ctx.onNavigate?.('lecture');
    currentView = 'lecture';
    state.current = id;
    save();
    renderLecture(lec);
    renderSidebar();
    renderHeader();
    scrollActiveIntoView();
    if (opts.startQuiz) startLectureQuiz(lec);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderLecture(lec) {
    const r = rec(lec.id);
    const prev = LECS[lec.idx - 1];
    const next = LECS[lec.idx + 1];
    const tags = [
      `<span class="tag accent">${esc(lec.no)}강</span>`,
      `<span class="tag">${esc(lec.section)}</span>`,
      `<span class="tag">${esc(lec.unit)}</span>`,
      `<span class="tag">⏱ ${esc(lec.len)}</span>`,
      isPassed(lec) ? `<span class="tag good">통과 · 최고 ${r.best}%</span>` : '',
    ].join('');

    $('#main').innerHTML = `<div class="container">
      <div class="lec-header">
        <div class="eyebrow">${tags}</div>
        <h1 class="lec-title">${esc(lec.title)}</h1>
      </div>

      <div class="player-card">
        <div class="player-wrap" id="playerWrap">
          <div id="ytPlayer"><div class="player-fallback">플레이어를 불러오는 중…</div></div>
          <div class="player-shield paused" id="playerShield"><span class="big-play" id="bigPlay">▶</span></div>
        </div>
        <div class="pctrl">
          <button class="pc-btn" id="pcPlay" aria-label="재생">▶</button>
          <button class="pc-btn" id="pcBack" aria-label="10초 뒤로" title="10초 뒤로">↺10</button>
          <input type="range" id="pcSeek" min="0" max="${lenToSec(lec.len)}" value="0" step="1" aria-label="재생 위치">
          <span class="pc-time" id="pcTime">0:00 / ${esc(lec.len)}</span>
          <select id="pcSpeed" aria-label="재생 속도">
            <option value="0.75">0.75x</option><option value="1" selected>1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option>
          </select>
          <button class="pc-btn" id="pcMute" aria-label="소리">🔊</button>
          <button class="pc-btn" id="pcFull" aria-label="전체화면" title="전체화면">⛶</button>
        </div>
        <div class="watch-row">
          <div class="watch-progress">
            <div class="watch-label"><span>시청 진도</span><strong id="watchPct">0%</strong></div>
            <div class="bar"><div class="bar-fill" id="watchFill"></div></div>
          </div>
        </div>
      </div>

      <section class="card" id="quizCard">
        <h2>✍️ 확인 테스트 <span class="muted" style="font-size:14px;font-weight:500">· ${lec.quiz.length}문제 · ${passText(settings.passRate)}</span></h2>
        <div class="quiz-gate">
          <p id="gateText">${esc(gateMessage(lec))}</p>
          <button class="btn primary big" id="startQuizBtn" ${canQuiz(lec) ? '' : 'disabled'}>${r.attempts ? '다시 풀기' : '테스트 시작'}</button>
        </div>
        ${r.attempts ? `<div class="best">응시 ${r.attempts}회 · 최고 점수 ${r.best}%</div>` : ''}
      </section>

      ${isPassed(lec) ? pointsCard(lec) : ''}

      <div class="nav-row">
        ${prev ? `<button class="btn" data-go="${prev.id}" ${isUnlocked(prev) ? '' : 'disabled'}>◀ 이전 강의</button>` : '<span></span>'}
        ${next ? `<button class="btn" data-go="${next.id}" ${isUnlocked(next) ? '' : 'disabled'} title="${isUnlocked(next) ? '' : '이 강의 테스트를 통과하면 열려요'}">다음 강의 ▶</button>` : '<span></span>'}
      </div>
    </div>`;

    $('#startQuizBtn').addEventListener('click', () => startLectureQuiz(lec));
    bindNav();
    updateWatchUI(lec);
    mountPlayer(lec);
  }

  function pointsCard(lec) {
    return `<section class="card">
      <h2>📌 핵심 정리</h2>
      <ul class="points">${lec.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    </section>`;
  }

  function bindNav() {
    document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => openLecture(b.dataset.go)));
  }

  // ---------------------------------------------------------------- quiz engine
  let quiz = null; // { items, i, results, checked, selected, onFinish, card }

  function buildItems(pairs) {
    return pairs.map(({ lec, qi }) => {
      const q = lec.quiz[qi];
      const item = { lec, qi, q };
      if (q.choices) {
        const fixed = q.choices.some((c) => /^[OX] \(/.test(c));
        item.order = fixed ? q.choices.map((_, i) => i) : shuffle(q.choices.map((_, i) => i));
      }
      return item;
    });
  }

  function startLectureQuiz(lec) {
    if (!canQuiz(lec)) return;
    if (player && player.pauseVideo) { try { player.pauseVideo(); } catch (e) { /* ignore */ } }
    const items = buildItems(lec.quiz.map((_, qi) => ({ lec, qi })));
    runQuiz($('#quizCard'), items, (results) => finishLectureQuiz(lec, results));
  }

  function runQuiz(card, items, onFinish) {
    quiz = { card, items, i: 0, results: [], checked: false, selected: null, onFinish };
    renderQuestion();
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderQuestion() {
    const { card, items, i, results } = quiz;
    const it = items[i];
    const q = it.q;
    quiz.checked = false;
    quiz.selected = null;
    const dots = items.map((_, k) => {
      const c = k < results.length ? (results[k].ok ? 'ok' : 'ng') : k === i ? 'current' : '';
      return `<span class="dot ${c}"></span>`;
    }).join('');
    const source = currentView === 'wrong' ? `<span class="tag accent">[${esc(it.lec.no)}] ${esc(it.lec.title)}</span>` : '';
    let body;
    if (q.type === 'input') {
      body = `<input class="answer-input" id="answerInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="정답을 입력하세요">
        <div class="hint">대소문자·마침표는 신경 쓰지 않아도 돼요. Enter로 확인</div>`;
    } else {
      body = `<div class="choices">${it.order.map((ci, k) =>
        `<button class="choice" data-ci="${ci}"><span class="key">${k + 1}</span><span>${esc(q.choices[ci])}</span></button>`).join('')}</div>`;
    }
    card.innerHTML = `
      <div class="quiz-top">
        <span class="quiz-step">문제 ${i + 1} / ${items.length}</span>
        <div class="dots">${dots}</div>
      </div>
      ${source}
      <div class="question pop">${fmtQ(q.q)}</div>
      ${body}
      <div id="feedback"></div>
      <div class="quiz-actions">
        <button class="btn primary" id="checkBtn" disabled>확인</button>
      </div>`;

    const checkBtn = $('#checkBtn', card);
    if (q.type === 'input') {
      const inp = $('#answerInput', card);
      inp.addEventListener('input', () => { checkBtn.disabled = !inp.value.trim(); });
      inp.focus({ preventScroll: true });
    } else {
      card.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => selectChoice(Number(b.dataset.ci))));
    }
    checkBtn.addEventListener('click', () => (quiz.checked ? nextQuestion() : checkAnswer()));
  }

  function selectChoice(ci) {
    if (quiz.checked) return;
    quiz.selected = ci;
    quiz.card.querySelectorAll('.choice').forEach((b) => b.classList.toggle('selected', Number(b.dataset.ci) === ci));
    $('#checkBtn', quiz.card).disabled = false;
  }

  function checkAnswer() {
    const { card, items, i } = quiz;
    const it = items[i];
    const q = it.q;
    let ok, mine;
    if (q.type === 'input') {
      const inp = $('#answerInput', card);
      mine = inp.value.trim();
      if (!mine) return;
      ok = q.answer.some((a) => norm(a) === norm(mine));
      inp.classList.add(ok ? 'correct' : 'wrong');
      inp.readOnly = true;
    } else {
      if (quiz.selected == null) return;
      mine = q.choices[quiz.selected];
      ok = quiz.selected === q.answer;
      card.querySelectorAll('.choice').forEach((b) => {
        const ci = Number(b.dataset.ci);
        b.disabled = true;
        b.classList.remove('selected');
        if (ci === q.answer) b.classList.add('correct');
        else if (ci === quiz.selected) b.classList.add('wrong');
      });
    }
    quiz.checked = true;
    quiz.results.push({ it, ok, mine });
    const right = q.type === 'input' ? q.answer[0] : q.choices[q.answer];
    const showRight = !ok && (q.type !== 'input' || !/\s/.test(right));
    $('#feedback', card).innerHTML = `<div class="feedback ${ok ? 'ok' : 'ng'} pop">
      <strong class="${ok ? 'ok-title' : 'ng-title'}">${ok ? '정답이에요! 🎉' : '아쉬워요 😢'}</strong>
      ${showRight ? `<div>정답: <b>${esc(right)}</b></div>` : ''}
      <div>${esc(q.exp)}</div>
    </div>`;
    const btn = $('#checkBtn', card);
    btn.textContent = i + 1 < items.length ? '다음 문제 →' : '결과 보기';
    btn.disabled = false;
    btn.focus({ preventScroll: true });
  }

  function nextQuestion() {
    quiz.i++;
    if (quiz.i < quiz.items.length) renderQuestion();
    else { const q = quiz; quiz = null; q.onFinish(q.results, q.card); }
  }

  // 키보드: 숫자키로 보기 선택, Enter로 확인/다음
  document.addEventListener('keydown', (e) => {
    if (!quiz || e.isComposing) return;
    if (document.querySelector('dialog[open]')) return;
    const it = quiz.items[quiz.i];
    if (!it) return;
    if (e.key === 'Enter') {
      const btn = $('#checkBtn', quiz.card);
      if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
      return;
    }
    if (it.q.type !== 'input' && !quiz.checked && /^[1-9]$/.test(e.key)) {
      const k = Number(e.key) - 1;
      if (k < it.order.length) selectChoice(it.order[k]);
    }
  });

  function recordWrong(results) {
    for (const { it, ok } of results) {
      const key = `${it.lec.id}#${it.qi}`;
      if (ok) delete state.wrong[key];
      else state.wrong[key] = { id: it.lec.id, q: it.qi, ts: Date.now() };
    }
  }

  function finishLectureQuiz(lec, results) {
    const r = rec(lec.id);
    const correct = results.filter((x) => x.ok).length;
    const pct = Math.round((correct / results.length) * 100);
    const pass = pct >= settings.passRate;
    const firstPass = pass && !r.passed;
    r.attempts = (r.attempts || 0) + 1;
    r.best = Math.max(r.best ?? 0, pct);
    if (pass) r.passed = true;
    recordWrong(results);
    save(true);
    ctx.onAttempt?.({
      lecture_id: lec.id,
      lecture_no: lec.no,
      correct,
      total: results.length,
      pct,
      passed: pass,
      wrong: results.filter((x) => !x.ok).map((x) => ({ q: x.it.qi, mine: x.mine })),
    });

    const next = LECS[lec.idx + 1];
    const wrongs = results.filter((x) => !x.ok);
    const card = $('#quizCard');
    card.innerHTML = `<div class="result pop">
        <div class="score">${correct}<small> / ${results.length}</small></div>
        <div class="verdict ${pass ? 'pass' : 'fail'}">${pass ? (pct === 100 ? '만점! 완벽해요 🏆' : '통과! 잘했어요 🎉') : (settings.passRate >= 100 ? '조금만 더! 모두 맞혀야 통과예요' : `조금만 더! ${settings.passRate}% 이상이면 통과예요`)}</div>
        <div class="muted">${pct}% · 최고 ${r.best}% · 응시 ${r.attempts}회</div>
        <div class="result-actions">
          ${pass && next ? `<button class="btn primary big" id="goNextBtn">다음 강의 ▶ [${esc(next.no)}]</button>` : ''}
          ${pass && !next ? `<button class="btn primary big" id="wrongNoteGo">🎓 1단계 완주! 오답노트 보기</button>` : ''}
          <button class="btn ${pass ? '' : 'primary big'}" id="retryBtn">다시 풀기</button>
          ${pass ? '' : '<button class="btn" id="rewatchBtn">강의 다시 보기</button>'}
        </div>
      </div>
      ${wrongs.length ? `<div class="review-list">${wrongs.map(reviewItem).join('')}</div>` : ''}`;

    $('#retryBtn').addEventListener('click', () => startLectureQuiz(lec));
    $('#goNextBtn')?.addEventListener('click', () => openLecture(next.id));
    $('#wrongNoteGo')?.addEventListener('click', openWrongNote);
    $('#rewatchBtn')?.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (player && player.seekTo) { try { player.seekTo(0, true); player.playVideo(); } catch (e) { /* ignore */ } }
    });

    if (pass && !$('#pointsCard')) {
      card.insertAdjacentHTML('afterend', pointsCard(lec).replace('<section class="card">', '<section class="card" id="pointsCard">'));
    }
    if (firstPass && next) toast(`다음 강의 [${next.no}]이(가) 열렸어요!`);
    renderSidebar();
    renderHeader();
    // 다음 강의 버튼 상태 갱신
    const nextNav = document.querySelector(`.nav-row [data-go="${next?.id}"]`);
    if (nextNav && isUnlocked(next)) { nextNav.disabled = false; nextNav.title = ''; }
  }

  function reviewItem({ it, mine }) {
    const q = it.q;
    const right = q.type === 'input' ? q.answer[0] : q.choices[q.answer];
    return `<div class="review-item">
      <div class="ri-q">${fmtQ(q.q)}</div>
      <div class="ri-mine">내 답: ${esc(mine)}</div>
      <div class="ri-a">정답: ${esc(right)}</div>
      <div class="ri-exp">${esc(q.exp)}</div>
    </div>`;
  }

  // ---------------------------------------------------------------- wrong note
  function wrongEntries() {
    return Object.values(state.wrong)
      .filter((w) => byId[w.id] && byId[w.id].quiz[w.q])
      .sort((a, b) => byId[a.id].idx - byId[b.id].idx || a.q - b.q);
  }

  function openWrongNote() {
    ctx.onNavigate?.('wrong');
    currentView = 'wrong';
    destroyPlayer();
    renderSidebar();
    closeDrawer();
    const entries = wrongEntries();
    let groups = '';
    let curId = null;
    for (const w of entries) {
      const lec = byId[w.id];
      const q = lec.quiz[w.q];
      if (w.id !== curId) {
        if (curId) groups += '</div>';
        curId = w.id;
        groups += `<div class="wn-group"><h3><a href="#" data-go="${lec.id}" style="color:inherit">[${esc(lec.no)}] ${esc(lec.title)}</a></h3>`;
      }
      const right = q.type === 'input' ? q.answer[0] : q.choices[q.answer];
      groups += `<div class="review-item" style="margin-bottom:6px">
        <div class="ri-q">${fmtQ(q.q)}</div>
        <div class="ri-a">정답: ${esc(right)}</div>
        <div class="ri-exp">${esc(q.exp)}</div>
      </div>`;
    }
    if (curId) groups += '</div>';

    $('#main').innerHTML = `<div class="container">
      <div class="lec-header">
        <div class="eyebrow"><span class="tag accent">오답노트</span></div>
        <h1 class="lec-title">틀린 문제 모아보기</h1>
      </div>
      <section class="card" id="quizCard">
        ${entries.length ? `<div class="quiz-gate">
            <p>지금까지 틀린 문제가 <b>${entries.length}개</b> 있어요. 다시 풀어서 맞히면 오답노트에서 사라져요.</p>
            <button class="btn primary big" id="wrongQuizBtn">오답 다시 풀기</button>
          </div>`
        : `<div class="empty"><div class="big-emoji">🌱</div><p>아직 틀린 문제가 없어요.<br>강의 테스트에서 틀린 문제가 여기에 모여요.</p></div>`}
      </section>
      ${entries.length ? `<section class="card"><h2>📒 문제 목록</h2>${groups}</section>` : ''}
      <div class="nav-row"><button class="btn" id="backToLecture">◀ 강의로 돌아가기</button><span></span></div>
    </div>`;

    $('#wrongQuizBtn')?.addEventListener('click', () => {
      const items = buildItems(shuffle(entries).map((w) => ({ lec: byId[w.id], qi: w.q })));
      runQuiz($('#quizCard'), items, finishWrongQuiz);
    });
    $('#backToLecture').addEventListener('click', () => openLecture(state.current || LECS[0].id));
    document.querySelectorAll('#main [data-go]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      const lec = byId[a.dataset.go];
      if (isUnlocked(lec)) openLecture(lec.id);
    }));
    window.scrollTo({ top: 0 });
  }

  function finishWrongQuiz(results) {
    recordWrong(results);
    save(true);
    renderHeader();
    const correct = results.filter((x) => x.ok).length;
    const left = wrongEntries().length;
    const wrongs = results.filter((x) => !x.ok);
    $('#quizCard').innerHTML = `<div class="result pop">
        <div class="score">${correct}<small> / ${results.length}</small></div>
        <div class="verdict ${left ? 'fail' : 'pass'}">${left ? `남은 오답 ${left}개` : '오답 정복 완료! 🎉'}</div>
        <div class="result-actions">
          <button class="btn primary" id="wrongAgain">${left ? '남은 오답 다시 보기' : '오답노트로'}</button>
          <button class="btn" id="backLec">강의로 돌아가기</button>
        </div>
      </div>
      ${wrongs.length ? `<div class="review-list">${wrongs.map(reviewItem).join('')}</div>` : ''}`;
    $('#wrongAgain').addEventListener('click', openWrongNote);
    $('#backLec').addEventListener('click', () => openLecture(state.current || LECS[0].id));
  }

  $('#wrongNoteBtn').addEventListener('click', openWrongNote);

  function firstOpenLecture() {
    return LECS.find((l) => isUnlocked(l) && !isPassed(l)) || LECS[LECS.length - 1];
  }

  // ---------------------------------------------------------------- boot
  window.addEventListener('beforeunload', () => save(true));

  if (location.protocol === 'file:') {
    setTimeout(() => toast('파일로 직접 열면 YouTube 영상이 안 나올 수 있어요. start.bat으로 실행하세요.'), 600);
  }

  renderHeader();

  // main.js(선생님 대시보드 전환 등)에서 쓰는 API
  return {
    toast,
    openCurrent() {
      const lec = byId[state.current] && isUnlocked(byId[state.current]) ? byId[state.current] : firstOpenLecture();
      openLecture(lec.id);
    },
    openWrongNote,
    // 다른 화면(대시보드)으로 나갈 때: 영상·퀴즈 정리
    leave() {
      destroyPlayer();
      quiz = null;
      currentView = 'other';
      save(true);
    },
  };
} };
