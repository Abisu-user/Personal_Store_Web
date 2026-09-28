-- Persist one #RRGGBB value per event, including yearly recurring events.
alter table public.calendar_events
  drop constraint if exists calendar_events_color_check;

update public.calendar_events
set color = case color
  when 'indigo' then '#7065AF'
  when 'blue' then '#4F74BC'
  when 'green' then '#5B986A'
  when 'amber' then '#D59658'
  when 'rose' then '#C86A6C'
  else color
end
where color in ('indigo', 'blue', 'green', 'amber', 'rose');

alter table public.calendar_events
  alter column color set default '#4F74BC',
  add constraint calendar_events_color_check check (color ~ '^#[0-9A-Fa-f]{6}$');
