-- Supabase 프로젝트에 적용된 스키마 (참고용 기록)

-- 사용자 프로필 (선생님/학생). 계정 생성·삭제는 Edge Function(service role)에서만 한다.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher', 'student')),
  login_id text not null unique,
  display_name text not null,
  teacher_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index profiles_teacher_id_idx on public.profiles(teacher_id);

-- 학생 앱 상태(시청 진도, 점수, 오답노트) 전체를 JSON으로 보관
create table public.student_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  passed_count int not null default 0,
  wrong_count int not null default 0,
  updated_at timestamptz not null default now()
);

-- 테스트 응시 기록 (한 번 풀 때마다 한 줄)
create table public.quiz_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  lecture_id text not null,
  lecture_no text not null,
  correct int not null,
  total int not null,
  pct int not null,
  passed boolean not null,
  wrong jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index quiz_attempts_user_created_idx on public.quiz_attempts(user_id, created_at desc);

-- RLS 헬퍼 (API에 노출되지 않는 private 스키마)
create schema if not exists private;
grant usage on schema private to authenticated;
create or replace function private.is_my_student(sid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = sid and p.teacher_id = (select auth.uid())
  );
$$;
revoke execute on function private.is_my_student(uuid) from public, anon;
grant execute on function private.is_my_student(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.student_state enable row level security;
alter table public.quiz_attempts enable row level security;

create policy "profiles_select_own_or_teacher" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or teacher_id = (select auth.uid()));

create policy "state_select" on public.student_state
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_my_student(user_id));
create policy "state_insert_own" on public.student_state
  for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid())));
create policy "state_update_own" on public.student_state
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "state_delete_teacher" on public.student_state
  for delete to authenticated
  using (private.is_my_student(user_id));

create policy "attempts_select" on public.quiz_attempts
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_my_student(user_id));
create policy "attempts_insert_own" on public.quiz_attempts
  for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid())));
create policy "attempts_delete_teacher" on public.quiz_attempts
  for delete to authenticated
  using (private.is_my_student(user_id));
