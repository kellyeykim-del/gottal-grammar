// 선생님 대시보드: 학생 계정 발급, 학생별 학습 기록 조회, 비밀번호 재설정/기록 초기화/삭제
window.TeacherDash = { create({ app, toast }) {
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LECS = (window.LECTURES || []).map((l, idx) => ({ ...l, idx }));
  const byId = Object.fromEntries(LECS.map((l) => [l.id, l]));
  const TOTAL = LECS.length;
  const siteUrl = location.origin + location.pathname.replace(/index\.html$/, '');
  const lenToSec = (len) => len.split(':').reduce((a, b) => a * 60 + Number(b), 0);

  let students = [];

  // ---------------------------------------------------------------- helpers
  function ago(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    const s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return '방금 전';
    if (s < 3600) return `${Math.floor(s / 60)}분 전`;
    if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
    return d.toLocaleDateString('ko-KR');
  }
  const fmtDate = (iso) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  function genPassword() {
    const letters = 'abcdefghjkmnpqrstuvwxyz';
    const arr = new Uint32Array(8);
    crypto.getRandomValues(arr);
    let p = '';
    for (let i = 0; i < 4; i++) p += letters[arr[i] % letters.length];
    for (let i = 4; i < 8; i++) p += String(arr[i] % 10);
    return p;
  }

  function lecStats(state, lec) {
    const r = state?.lectures?.[lec.id];
    if (!r) return { watch: 0, attempts: 0, best: null, passed: false, manual: false };
    let seen = 0;
    for (const c of r.seen || '') if (c === '1') seen++;
    const dur = r.duration || lenToSec(lec.len);
    const watch = r.passed || r.manual ? 100 : Math.min(100, Math.round((seen / dur) * 100));
    return { watch, attempts: r.attempts || 0, best: r.best, passed: !!r.passed, manual: !!r.manual };
  }

  function summarize(record) {
    const st = record?.state;
    let attempts = 0;
    for (const lec of LECS) attempts += st?.lectures?.[lec.id]?.attempts || 0;
    const passed = LECS.filter((l) => st?.lectures?.[l.id]?.passed).length;
    const cur = byId[st?.current];
    // "지금 공부 중": 아직 통과하지 못한 첫 강의
    const nextLec = LECS.find((l) => !st?.lectures?.[l.id]?.passed);
    return {
      passed,
      attempts,
      wrong: st?.wrong ? Object.keys(st.wrong).length : 0,
      current: nextLec ? nextLec : null,
      lastViewed: cur || null,
      updated: record?.updated_at || null,
    };
  }

  function copyText(text) {
    navigator.clipboard?.writeText(text).then(() => toast('복사했어요'), () => toast('복사하지 못했어요'));
  }

  // ---------------------------------------------------------------- list view
  async function show() {
    app.leave();
    document.body.classList.add('view-dashboard');
    $('#main').innerHTML = `<div class="container wide"><div class="empty">학생 목록을 불러오는 중…</div></div>`;
    window.scrollTo({ top: 0 });
    try {
      students = await Cloud.listStudents();
    } catch (e) {
      $('#main').innerHTML = `<div class="container"><div class="card">학생 목록을 불러오지 못했어요. 새로고침해 주세요.<br><small class="muted">${esc(e.message)}</small></div></div>`;
      return;
    }
    renderList();
  }

  function hide() {
    document.body.classList.remove('view-dashboard');
  }

  function renderList(created) {
    const rows = students.map((s) => {
      const sm = summarize(s.record);
      const pct = Math.round((sm.passed / TOTAL) * 100);
      return `<tr data-id="${s.id}" class="clickable">
        <td><strong>${esc(s.display_name)}</strong><div class="muted small">${esc(s.login_id)}</div></td>
        <td class="progress-cell">
          <div class="bar"><div class="bar-fill ${sm.passed === TOTAL ? 'done' : ''}" style="width:${pct}%"></div></div>
          <div class="small">${sm.passed} / ${TOTAL} 강 통과</div>
        </td>
        <td>${sm.current ? `<span class="tag accent">[${esc(sm.current.no)}]</span> <span class="small">${esc(sm.current.title)}</span>` : '<span class="tag good">완주 🎓</span>'}</td>
        <td class="num">${sm.attempts}</td>
        <td class="num">${sm.wrong}</td>
        <td>${s.record ? esc(ago(sm.updated)) : '<span class="muted">아직 없음</span>'}</td>
        <td class="num"><span class="go">›</span></td>
      </tr>`;
    }).join('');

    $('#main').innerHTML = `<div class="container wide">
      <div class="lec-header dash-head">
        <div>
          <div class="eyebrow"><span class="tag accent">선생님</span></div>
          <h1 class="lec-title">학생 관리</h1>
          <div class="muted">학생 ${students.length}명 · 학생 접속 주소 <a href="${esc(siteUrl)}" target="_blank" rel="noopener">${esc(siteUrl)}</a></div>
        </div>
        <button class="btn" id="refreshBtn">↻ 새로고침</button>
      </div>

      <section class="card">
        <h2>➕ 학생 아이디 발급</h2>
        <form id="addForm" class="add-form">
          <label>이름<input name="display_name" placeholder="예: 김민지" maxlength="30" required></label>
          <label>아이디<input name="login_id" placeholder="예: minji01" autocapitalize="off" spellcheck="false" required></label>
          <label>비밀번호
            <span class="pw-row"><input name="password" required minlength="6"><button type="button" class="btn small" id="genPw">자동 생성</button></span>
          </label>
          <button class="btn primary" type="submit">발급하기</button>
        </form>
        <div class="form-error" id="addError"></div>
        <p class="muted small-note">아이디는 영어 소문자·숫자 3~20자 (. _ - 사용 가능). 비밀번호는 6자 이상.</p>
        ${created ? credentialBox(created) : ''}
      </section>

      <section class="card">
        <h2>📊 학습 현황</h2>
        ${students.length ? `<div class="table-wrap"><table class="data-table student-table">
          <thead><tr><th>학생</th><th>진도</th><th>지금 공부할 강의</th><th class="num">응시</th><th class="num">오답</th><th>마지막 학습</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`
        : `<div class="empty"><div class="big-emoji">🧑‍🎓</div><p>아직 학생이 없어요. 위에서 학생 아이디를 발급해 주세요.</p></div>`}
      </section>
    </div>`;

    const f = $('#addForm');
    f.password.value = genPassword();
    $('#genPw').addEventListener('click', () => { f.password.value = genPassword(); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]');
      $('#addError').textContent = '';
      btn.disabled = true;
      const payload = { display_name: f.display_name.value.trim(), login_id: f.login_id.value.trim().toLowerCase(), password: f.password.value };
      try {
        await Cloud.admin('create_student', payload);
        students = await Cloud.listStudents();
        renderList(payload);
        toast(`${payload.display_name} 학생 아이디를 발급했어요`);
      } catch (err) {
        $('#addError').textContent = err.message;
        btn.disabled = false;
      }
    });
    $('#refreshBtn').addEventListener('click', show);
    $('#copyCred')?.addEventListener('click', () => copyText($('#credText').textContent));
    document.querySelectorAll('tr.clickable').forEach((tr) => tr.addEventListener('click', () => showStudent(tr.dataset.id)));
  }

  function credentialBox(c) {
    const text = `[고딸영문법 학습 사이트]\n주소: ${siteUrl}\n아이디: ${c.login_id}\n비밀번호: ${c.password}`;
    const shown = esc(text).replace(esc(siteUrl), `<a href="${esc(siteUrl)}" target="_blank" rel="noopener">${esc(siteUrl)}</a>`);
    return `<div class="cred-box pop">
      <div><strong>${esc(c.display_name)}</strong> 학생에게 아래 정보를 전달해 주세요.</div>
      <pre id="credText">${shown}</pre>
      <button class="btn small" id="copyCred">📋 복사하기</button>
    </div>`;
  }

  // ---------------------------------------------------------------- detail view
  async function showStudent(id) {
    const s = students.find((x) => x.id === id);
    if (!s) return;
    $('#main').innerHTML = `<div class="container wide"><div class="empty">기록을 불러오는 중…</div></div>`;
    window.scrollTo({ top: 0 });
    let attempts = [];
    try { attempts = await Cloud.studentAttempts(id); } catch (e) { console.warn(e); }

    const st = s.record?.state;
    const sm = summarize(s.record);
    const today = new Date().toDateString();
    const todayAttempts = attempts.filter((a) => new Date(a.created_at).toDateString() === today).length;

    let lecRows = '';
    let section = null;
    for (const lec of LECS) {
      if (lec.section !== section) {
        section = lec.section;
        const inSec = LECS.filter((l) => l.section === section);
        const done = inSec.filter((l) => st?.lectures?.[l.id]?.passed).length;
        lecRows += `<tr class="sec-row"><td colspan="6">${esc(section)} <span class="muted">${done}/${inSec.length}</span></td></tr>`;
      }
      const x = lecStats(st, lec);
      const status = x.passed ? '<span class="tag good">통과</span>'
        : x.attempts ? '<span class="tag bad">도전 중</span>'
        : x.watch >= 85 ? '<span class="tag accent">시청 완료</span>'
        : x.watch > 0 ? '<span class="tag">시청 중</span>' : '<span class="muted">-</span>';
      lecRows += `<tr>
        <td class="num">${esc(lec.no)}</td>
        <td>${esc(lec.title)}</td>
        <td class="watch-cell">${x.manual && !x.passed ? '<span class="small">YouTube</span>' : `<div class="bar mini"><div class="bar-fill" style="width:${x.watch}%"></div></div><span class="small">${x.watch}%</span>`}</td>
        <td class="num">${x.attempts || '-'}</td>
        <td class="num">${x.best != null ? `${x.best}%` : '-'}</td>
        <td>${status}</td>
      </tr>`;
    }

    const attemptRows = attempts.map((a) => {
      const lec = byId[a.lecture_id];
      const wrongs = (a.wrong || []).map((w) => {
        const q = lec?.quiz?.[w.q];
        return q ? `<li>${esc(q.q)} <span class="ri-mine">→ ${esc(w.mine)}</span></li>` : '';
      }).join('');
      return `<tr>
        <td>${esc(fmtDate(a.created_at))}</td>
        <td><span class="tag accent">[${esc(a.lecture_no)}]</span> <span class="small">${esc(lec?.title || '')}</span></td>
        <td class="num"><strong>${a.correct}/${a.total}</strong></td>
        <td>${a.passed ? '<span class="tag good">통과</span>' : '<span class="tag bad">재도전</span>'}</td>
        <td>${wrongs ? `<details><summary class="small">틀린 문제 ${a.wrong.length}개</summary><ul class="wrong-list">${wrongs}</ul></details>` : '<span class="muted small">-</span>'}</td>
      </tr>`;
    }).join('');

    const wrongItems = st?.wrong ? Object.values(st.wrong)
      .filter((w) => byId[w.id]?.quiz?.[w.q])
      .sort((a, b) => byId[a.id].idx - byId[b.id].idx || a.q - b.q)
      .map((w) => `<li><span class="tag accent">[${esc(byId[w.id].no)}]</span> ${esc(byId[w.id].quiz[w.q].q)}</li>`).join('') : '';

    $('#main').innerHTML = `<div class="container wide">
      <button class="btn small ghost" id="backBtn">◀ 학생 목록</button>
      <div class="lec-header dash-head" style="margin-top:10px">
        <div>
          <div class="eyebrow"><span class="tag">아이디 ${esc(s.login_id)}</span><span class="tag">발급 ${esc(new Date(s.created_at).toLocaleDateString('ko-KR'))}</span></div>
          <h1 class="lec-title">${esc(s.display_name)}</h1>
        </div>
        <div class="dash-actions">
          <button class="btn small" id="pwBtn">🔑 비밀번호 재설정</button>
          <button class="btn small" id="resetRecBtn">↺ 기록 초기화</button>
          <button class="btn small danger" id="delBtn">학생 삭제</button>
        </div>
      </div>
      <div id="pwArea"></div>

      <div class="stat-grid">
        <div class="stat"><div class="stat-label">통과한 강의</div><div class="stat-value">${sm.passed}<small> / ${TOTAL}</small></div>
          <div class="bar"><div class="bar-fill" style="width:${(sm.passed / TOTAL) * 100}%"></div></div></div>
        <div class="stat"><div class="stat-label">지금 공부할 강의</div><div class="stat-value small-value">${sm.current ? `[${esc(sm.current.no)}] ${esc(sm.current.title)}` : '완주 🎓'}</div></div>
        <div class="stat"><div class="stat-label">테스트 응시</div><div class="stat-value">${attempts.length}<small> 회</small></div><div class="muted small">오늘 ${todayAttempts}회</div></div>
        <div class="stat"><div class="stat-label">남은 오답</div><div class="stat-value">${sm.wrong}<small> 문제</small></div></div>
        <div class="stat"><div class="stat-label">마지막 학습</div><div class="stat-value small-value">${esc(ago(sm.updated))}</div>
          <div class="muted small">${sm.updated ? esc(new Date(sm.updated).toLocaleString('ko-KR')) : ''}</div></div>
      </div>

      <section class="card">
        <h2>📝 테스트 응시 기록</h2>
        ${attempts.length ? `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>일시</th><th>강의</th><th class="num">점수</th><th>결과</th><th>틀린 문제</th></tr></thead>
          <tbody>${attemptRows}</tbody></table></div>`
        : '<div class="empty"><p>아직 응시 기록이 없어요.</p></div>'}
      </section>

      <section class="card">
        <h2>📚 강의별 진도</h2>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th class="num">강</th><th>제목</th><th>시청</th><th class="num">응시</th><th class="num">최고</th><th>상태</th></tr></thead>
          <tbody>${lecRows}</tbody></table></div>
      </section>

      <section class="card">
        <h2>📒 오답노트 (아직 못 맞힌 문제)</h2>
        ${wrongItems ? `<ul class="wrong-list">${wrongItems}</ul>` : '<div class="empty"><p>남은 오답이 없어요.</p></div>'}
      </section>
    </div>`;

    $('#backBtn').addEventListener('click', () => renderList());
    $('#pwBtn').addEventListener('click', () => {
      const pw = genPassword();
      $('#pwArea').innerHTML = `<div class="card"><form id="pwForm" class="add-form">
          <label>새 비밀번호<span class="pw-row"><input name="password" value="${pw}" minlength="6" required><button type="button" class="btn small" id="genPw2">자동 생성</button></span></label>
          <button class="btn primary" type="submit">재설정</button>
          <button class="btn" type="button" id="pwCancel">취소</button>
        </form><div class="form-error" id="pwError"></div><div id="pwDone"></div></div>`;
      const f = $('#pwForm');
      $('#genPw2').addEventListener('click', () => { f.password.value = genPassword(); });
      $('#pwCancel').addEventListener('click', () => { $('#pwArea').innerHTML = ''; });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        $('#pwError').textContent = '';
        try {
          await Cloud.admin('reset_password', { user_id: s.id, password: f.password.value });
          const cred = { display_name: s.display_name, login_id: s.login_id, password: f.password.value };
          $('#pwDone').innerHTML = credentialBox(cred);
          f.remove();
          $('#copyCred').addEventListener('click', () => copyText($('#credText').textContent));
          toast('비밀번호를 바꿨어요');
        } catch (err) {
          $('#pwError').textContent = err.message;
        }
      });
    });
    $('#resetRecBtn').addEventListener('click', async () => {
      if (!confirm(`${s.display_name} 학생의 시청 기록, 점수, 응시 기록, 오답노트를 모두 지울까요?\n되돌릴 수 없어요.`)) return;
      try {
        await Cloud.resetStudentRecord(s.id);
        students = await Cloud.listStudents();
        toast('기록을 초기화했어요');
        showStudent(s.id);
      } catch (err) { toast(`초기화하지 못했어요: ${err.message}`); }
    });
    $('#delBtn').addEventListener('click', async () => {
      const typed = prompt(`${s.display_name} 학생 계정과 모든 기록을 삭제합니다. 되돌릴 수 없어요.\n삭제하려면 아이디(${s.login_id})를 입력하세요.`);
      if (typed == null) return;
      if (typed.trim().toLowerCase() !== s.login_id) { toast('아이디가 일치하지 않아 취소했어요'); return; }
      try {
        await Cloud.admin('delete_student', { user_id: s.id });
        students = await Cloud.listStudents();
        renderList();
        toast('학생을 삭제했어요');
      } catch (err) { toast(`삭제하지 못했어요: ${err.message}`); }
    });
  }

  return { show, hide };
} };
