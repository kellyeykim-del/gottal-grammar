// 시작: 로그인 확인 → 학습 기록 불러오기 → 학생 앱 / 선생님 대시보드
(() => {
  'use strict';
  const $ = (sel, root = document) => root.querySelector(sel);
  const LEGACY_KEY = 'gottal-grammar-1'; // 로그인 기능 이전에 브라우저에 저장된 진도

  // iframe_api가 로그인보다 먼저 로드돼도 괜찮도록 기본 콜백
  if (!window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady = () => {};

  const show = (id) => {
    for (const el of ['authLoading', 'loginForm', 'setupForm']) $(`#${el}`).hidden = el !== id;
    const first = $(`#${id} input`);
    if (first) first.focus();
  };

  async function showAuth() {
    document.body.className = 'auth-mode';
    show('authLoading');
    let hasTeacher = true;
    try { hasTeacher = (await Cloud.admin('status')).hasTeacher; } catch (e) { /* 네트워크 오류 시 로그인만 표시 */ }
    $('#setupLinkWrap').hidden = hasTeacher;
    show('loginForm');
  }

  $('#setupLink').addEventListener('click', (e) => { e.preventDefault(); show('setupForm'); });
  $('#backToLogin').addEventListener('click', (e) => { e.preventDefault(); show('loginForm'); });

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button[type=submit]');
    $('#loginError').textContent = '';
    btn.disabled = true;
    try {
      await Cloud.signIn(f.login_id.value, f.password.value);
      f.reset();
      await enter();
    } catch (err) {
      $('#loginError').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  $('#setupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button[type=submit]');
    $('#setupError').textContent = '';
    if (f.password.value !== f.password2.value) { $('#setupError').textContent = '비밀번호 확인이 일치하지 않아요.'; return; }
    btn.disabled = true;
    try {
      const loginId = f.login_id.value.trim().toLowerCase();
      await Cloud.admin('setup_teacher', { login_id: loginId, password: f.password.value, display_name: f.display_name.value });
      await Cloud.signIn(loginId, f.password.value);
      f.reset();
      await enter();
    } catch (err) {
      $('#setupError').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // ---------------------------------------------------------------- 로그인 이후
  let app = null;
  let profile = null;

  async function enter() {
    document.body.className = 'auth-mode';
    show('authLoading');
    profile = await Cloud.myProfile();
    if (!profile) {
      await Cloud.signOut();
      show('loginForm');
      $('#loginError').textContent = '등록되지 않은 계정이에요. 선생님께 문의하세요.';
      return;
    }
    let remote = null;
    try { remote = await Cloud.loadState(); } catch (e) { console.warn(e); }

    // 로그인 전 이 브라우저에 남아 있던 진도가 있고 서버 기록이 없으면 옮겨온다
    let initial = remote;
    if (!initial && profile.role === 'student') {
      try {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
        if (legacy && legacy.lectures) initial = legacy;
      } catch (e) { /* ignore */ }
    }

    const isTeacher = profile.role === 'teacher';
    document.body.className = isTeacher ? 'role-teacher' : 'role-student';
    $('#userName').textContent = profile.display_name;
    $('#userAvatar').textContent = profile.display_name.trim().slice(0, 1);
    $('#accName').textContent = profile.display_name;
    $('#accLogin').textContent = profile.login_id;
    $('#accRole').textContent = isTeacher ? (profile.is_admin ? '선생님 (관리자)' : '선생님') : '학생';

    app = GottalApp.start({
      isTeacher,
      initialState: initial,
      persist: (state, summary, immediate) => Cloud.saveState(state, summary, immediate),
      onAttempt: (a) => Cloud.logAttempt(a),
      onNavigate: (view) => {
        document.body.classList.toggle('view-dashboard', false);
        if (view) teacherDash?.hide();
      },
    });
    if (initial && !remote) Cloud.saveState(initial, { passed: 0, wrong: 0 }, true);

    if (isTeacher) {
      teacherDash = TeacherDash.create({ app, toast: app.toast, profile });
      teacherDash.show();
    } else {
      app.openCurrent();
    }
  }

  let teacherDash = null;

  $('#dashBtn').addEventListener('click', () => teacherDash?.show());
  $('#lectureViewBtn').addEventListener('click', () => app?.openCurrent());

  // 계정 창
  const syncText = { saving: '저장 중…', saved: '저장됨 ✓', error: '저장 실패 (다시 시도 중)' };
  Cloud.onStatus = (s) => { $('#accSync').textContent = syncText[s] || '-'; };
  $('#accountBtn').addEventListener('click', () => $('#accountDialog').showModal());
  $('#logoutBtn').addEventListener('click', async () => {
    $('#logoutBtn').disabled = true;
    try { await Cloud.signOut(); } finally { location.reload(); }
  });

  (async () => {
    try {
      const user = await Cloud.currentUser();
      if (user) await enter();
      else await showAuth();
    } catch (e) {
      console.error(e);
      await showAuth();
    }
  })();
})();
