// 앱 설치(홈 화면에 추가) 안내
(() => {
  'use strict';
  const ua = navigator.userAgent;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isKakao = /KAKAOTALK/i.test(ua);
  const isInApp = isKakao || /NAVER|Instagram|FBAN|FBAV|Line\//i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isSafari = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  const buttons = () => document.querySelectorAll('.install-btn');
  const showButtons = (on) => buttons().forEach((b) => { b.hidden = !on; });

  if (isStandalone) return; // 이미 앱으로 실행 중

  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    showButtons(true);
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    showButtons(false);
  });

  // 설치 창을 띄울 수 없는 환경(아이폰, 카카오톡 등)은 방법 안내 버튼을 보여준다
  if (isIOS || isInApp || isAndroid) showButtons(true);

  function steps() {
    if (isKakao) {
      return `<p>카카오톡 안에서는 설치할 수 없어요. 먼저 다른 브라우저로 열어 주세요.</p>
        <ol class="install-steps">
          <li>오른쪽 아래(또는 위) <b>⋮ / ⋯</b> 메뉴를 누르기</li>
          <li><b>${isIOS ? 'Safari로 열기' : '다른 브라우저로 열기'}</b> 선택</li>
          <li>열린 브라우저에서 다시 <b>📱 앱으로 설치하기</b>를 눌러 주세요</li>
        </ol>`;
    }
    if (isInApp) {
      return `<p>지금 앱 안의 브라우저에서 열려 있어요. 메뉴에서 <b>${isIOS ? 'Safari' : 'Chrome'}로 열기</b>를 선택한 뒤 다시 시도해 주세요.</p>`;
    }
    if (isIOS) {
      return `${isSafari ? '' : '<p><b>Safari</b>에서 열어야 설치할 수 있어요. 주소를 복사해 Safari에 붙여 넣어 주세요.</p>'}
        <ol class="install-steps">
          <li>화면 아래(아이패드는 위) <b>공유 버튼</b> <span class="ios-share">⬆︎</span> 누르기</li>
          <li>목록을 내려 <b>홈 화면에 추가</b> 선택</li>
          <li>오른쪽 위 <b>추가</b> 누르기</li>
        </ol>
        <p class="muted small-note">홈 화면의 <b>고딸영문법</b> 아이콘으로 열면 처음 한 번은 다시 로그인해야 해요.</p>`;
    }
    return `<ol class="install-steps">
        <li>Chrome 오른쪽 위 <b>⋮</b> 메뉴 누르기</li>
        <li><b>홈 화면에 추가</b> 또는 <b>앱 설치</b> 선택</li>
        <li><b>설치</b> 누르기</li>
      </ol>`;
  }

  document.addEventListener('click', async (e) => {
    if (!e.target.closest('.install-btn')) return;
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') showButtons(false);
      deferred = null;
      return;
    }
    document.getElementById('installSteps').innerHTML = steps();
    document.querySelector('dialog[open]')?.close();
    document.getElementById('installDialog').showModal();
  });
})();
