// Supabase 연결 정보 (publishable key는 브라우저에 공개되어도 되는 키입니다. 데이터 보호는 RLS 정책이 담당)
window.APP_CONFIG = {
  SUPABASE_URL: 'https://urzitmmblbhvnwdooluf.supabase.co',
  SUPABASE_KEY: 'sb_publishable_oDjzLEMyHHw3d7jMMbQFxQ_4pM0yN1L',
  // 아이디를 Supabase Auth 이메일로 바꿀 때 쓰는 도메인 (실제 메일은 보내지 않음). Edge Function과 같아야 함
  EMAIL_DOMAIN: 'students.gottal-grammar.app',
  PASS_RATE: 100, // 테스트 통과 기준(%)
};
