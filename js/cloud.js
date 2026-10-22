// Supabase 연동: 로그인, 학습 기록 저장/불러오기, 선생님용 조회, 계정 관리 함수 호출
(() => {
  'use strict';
  const C = window.APP_CONFIG;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'gottal-grammar-auth' },
  });

  let accessToken = null;
  let userId = null;
  sb.auth.onAuthStateChange((_event, session) => {
    accessToken = session?.access_token ?? null;
    userId = session?.user?.id ?? null;
  });

  const emailOf = (loginId) => `${String(loginId).trim().toLowerCase()}@${C.EMAIL_DOMAIN}`;

  async function signIn(loginId, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email: emailOf(loginId), password });
    if (error) throw new Error(error.message.includes('Invalid login') ? '아이디 또는 비밀번호가 맞지 않아요.' : error.message);
    accessToken = data.session.access_token;
    userId = data.user.id;
    return data.user;
  }

  async function signOut() {
    await flush();
    await sb.auth.signOut();
  }

  async function currentUser() {
    const { data } = await sb.auth.getSession();
    accessToken = data.session?.access_token ?? null;
    userId = data.session?.user?.id ?? null;
    return data.session?.user ?? null;
  }

  async function myProfile() {
    const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function admin(action, payload = {}) {
    const res = await fetch(`${C.SUPABASE_URL}/functions/v1/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: C.SUPABASE_KEY,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(body.error || '요청을 처리하지 못했어요.');
    return body;
  }

  // ---------------------------------------------------------------- 학습 상태 저장
  async function loadState() {
    const { data, error } = await sb.from('student_state').select('state').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data?.state ?? null;
  }

  let pending = null;   // 아직 서버에 안 보낸 최신 행
  let timer = null;
  let onStatus = () => {};

  function rowOf(state, summary) {
    return {
      user_id: userId,
      state,
      passed_count: summary.passed,
      wrong_count: summary.wrong,
      updated_at: new Date().toISOString(),
    };
  }

  // 자주 호출돼도 되도록 모아서 보냄 (기본 15초, immediate면 바로)
  function saveState(state, summary, immediate = false) {
    if (!userId) return;
    pending = rowOf(state, summary);
    clearTimeout(timer);
    timer = setTimeout(flush, immediate ? 0 : 15000);
  }

  async function flush() {
    clearTimeout(timer);
    if (!pending || !userId) return;
    const row = pending;
    pending = null;
    onStatus('saving');
    const { error } = await sb.from('student_state').upsert(row, { onConflict: 'user_id' });
    if (error) {
      if (!pending) pending = row; // 실패하면 다음에 다시 시도
      timer = setTimeout(flush, 30000);
      onStatus('error');
    } else {
      onStatus('saved');
    }
  }

  // 페이지를 닫을 때: keepalive fetch로 마지막 기록 전송
  function flushOnExit() {
    if (!pending || !accessToken) return;
    const row = pending;
    pending = null;
    try {
      fetch(`${C.SUPABASE_URL}/rest/v1/student_state?on_conflict=user_id`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          apikey: C.SUPABASE_KEY,
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(row),
      });
    } catch (e) { /* ignore */ }
  }
  window.addEventListener('pagehide', flushOnExit);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  async function logAttempt(a) {
    const { error } = await sb.from('quiz_attempts').insert({ user_id: userId, ...a });
    if (error) console.warn('attempt log failed', error);
  }

  // ---------------------------------------------------------------- 선생님용 조회
  async function listStudents() {
    const { data: students, error } = await sb.from('profiles')
      .select('id, login_id, display_name, created_at')
      .eq('role', 'student').eq('teacher_id', userId)
      .order('display_name');
    if (error) throw error;
    const ids = students.map((s) => s.id);
    let states = [];
    if (ids.length) {
      const r = await sb.from('student_state').select('user_id, state, passed_count, wrong_count, updated_at').in('user_id', ids);
      if (r.error) throw r.error;
      states = r.data;
    }
    const byUser = Object.fromEntries(states.map((s) => [s.user_id, s]));
    return students.map((s) => ({ ...s, record: byUser[s.id] ?? null }));
  }

  async function studentAttempts(studentId, limit = 200) {
    const { data, error } = await sb.from('quiz_attempts')
      .select('lecture_id, lecture_no, correct, total, pct, passed, wrong, created_at')
      .eq('user_id', studentId).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
  }

  async function resetStudentRecord(studentId) {
    const a = await sb.from('quiz_attempts').delete().eq('user_id', studentId);
    if (a.error) throw a.error;
    const b = await sb.from('student_state').delete().eq('user_id', studentId);
    if (b.error) throw b.error;
  }

  window.Cloud = {
    signIn, signOut, currentUser, myProfile, admin,
    loadState, saveState, flush, logAttempt,
    listStudents, studentAttempts, resetStudentRecord,
    set onStatus(fn) { onStatus = fn; },
    get userId() { return userId; },
  };
})();
