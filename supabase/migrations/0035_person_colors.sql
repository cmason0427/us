-- Each person's calendar color for "just me" plans, the same on both phones.
alter table public.profiles add column cal_color text not null default 'green' check (cal_color in ('pink', 'green'));
update public.profiles p set cal_color = 'pink' from auth.users u where u.id = p.id and u.email = 'charliemason0427@gmail.com';
