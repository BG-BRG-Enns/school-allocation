# Setting up and the catalogue

## Creating a registration

![The New registration form with name, school year, three project days and the classes taking part, by year](/bilder/en/anmeldung-anlegen.png)

Under **Registrations**, use **New registration** to enter the **Name** (Project Week 2027), **School year** (2026/27) and **Project days**; beside each date stands its weekday, so a wrong month shows, and **Add day** proposes the day after the last. Under **Classes taking part** every class of the class lists is preselected, by year; take out those that are not in (the final year in its last weeks of school, for an elective everyone but year 9), one by one, by year or with **Select all** and **Select none**. A class that does not take part does not see the registration and gets no invitation; its students are not counted in places and demand, and an activity cannot name it. **Create registration** creates it in the “In preparation” state. Only the organisation can see it for now, and you can take your time entering the [settings](./einstellungen); the classes change there while activities are collected, and a class an activity or a rule names stays in. Beside the state stands how many classes of which years take part, and the Organisation section names the classes of the class lists that are not in, including one that joined the lists after the registration was created: it takes part once you enter it. A registration that stays in preparation (the wrong school year, a try) is deleted with **Delete registration**: it goes with its rules and the drafts of its activities; the school's log records that it existed.

## Collecting activities

**Collect activities** opens the registration to teachers: they see it and submit their activities with **New activity**. Like every step it is confirmed once more; **Back to preparation** takes it back as long as the catalogue is not published, the teachers' drafts stay. The [Teachers](/en/lehrkraefte/aktivitaet) handbook explains the form. You can also create activities yourself, including for a teacher you enter in the form.

An activity's **lead** is whoever created it, as long as they are among its teachers; otherwise the first teacher named. If you are a teacher yourself, a new activity already lists you: when you create it for someone else, take yourself off, and the first teacher named leads.

## Reviewing activities

![A submitted activity in the registration's list: title and cost, teacher, session, places, state and the Edit, Approve, Return and Withdraw buttons](/bilder/en/aktivitaeten-pruefen.png)

The table shows each activity with its years, teachers (lead and companions), sessions, the date of its first submission (**Submitted on**: returning and resubmitting do not change it, so a correction moves nobody back), places, cost and status; **Order** sorts them by number or by submission, the earliest first. A submitted activity says where its places go: into which cells short of the target ("brings places to: Year 5, P4–5") or "only where the target is reached". If the lead is not available, or only if needed, on a day of the activity, that is noted beside them. The Organisation section counts drafts, submitted, approved and withdrawn activities. For a submitted activity you have three buttons:

- **Approve** adds it to the catalogue.
- **Return** sends it back with **Feedback to the teachers**. It becomes a draft again, and the teachers see your feedback.
- **Withdraw** removes it with a reason.

**Edit** opens any activity. Changes you make to a teacher's activity are recorded.

**A class is in one class activity at a time.** A class activity whose class is already in a submitted or approved class activity at an overlapping time is refused at submission, not merely warned about: with a class entered twice, the allocation cannot be calculated. Whoever submits first has the class; two class activities on the same day without overlap are allowed, a trip over several days overlaps on each of them. The same applies when you change the classes or the times of a submitted or approved class activity. You resolve a conflict: take the class out of one activity, then the teacher submits the other. Before **Publish catalogue**, the step warns of conflicts among approved class activities that existed before this rule.

## Places and demand

![Places and demand: a table per project day, the years as rows, Monday with its attendance frame a column per period, with need, target and offer](/bilder/en/bedarf.png)

For each project day there is a table: for each year, how many students need a place, the **target** and how many places the submitted and approved activities offer them. Anyone in a class activity with their whole class at that time is not counted. If the day has an [attendance frame](./einstellungen#attendance-frame-per-project-day), the table has a column per period: an activity counts in every period it touches, even in part (a trip until 11:00 counts for period 4, which ends at 11:20), and a class on a trip until 11:00 needs places again from period 5. That shows when 200 places in one-hour courses look like two places per child but fill one period only. Without a frame the whole day is one column. The target lies above the need by the **places above the need**, 20% unless you enter otherwise in the [settings](./einstellungen), so the choices have room. A cell short of the target is marked; more activities are needed there. Teachers also see these tables while activities are being collected, on the registration page and in the activity form.

## Teachers by day

**Teachers by day** in the Organisation section shows, for each teacher and project day, whether they are available, what they lead and what they accompany, or that they are free. A day on which someone is unavailable or available only if needed is marked. Above it, it names who leads nothing on any day. It counts the activities that can still take place: approved ones, unless the allocation cancels them; submitted ones until registration opens; drafts while activities are being collected.

![Teachers by day: for each teacher and project day the availability and what they lead or accompany](/bilder/en/lehrkraefte-je-tag.png)

Teachers enter their own availability while activities are being collected ([Availability](/en/lehrkraefte/verfuegbarkeit)). Here you change it for any teacher until the registration is closed; every change is recorded. **Teachers by day as Excel** gives the overview as a spreadsheet ([Excel files](./excel)).

![Availability from a CSV file: the pasted list, followed by the check with each teacher's days, before and new, and the Apply button](/bilder/en/verfuegbarkeit-import.png)

If the school already has the availability in a list, upload it under **Availability from a CSV file**: one row per teacher, named by e-mail address or abbreviation ([Class teachers](/en/verwaltung/klassenvorstaende)), and one column per project day, headed by the date or the weekday (`MO`, `DI`, `MI` or `Mon`, `Tue`, `Wed`). Empty means available, `N` not available, `F` only if necessary. The school's list with the columns `Name`, `MO`, `DI`, `MI`, `Leitung` and `Anmerkung` is read as the spreadsheet exports it; an empty column at the end, as a deleted column leaves it, does no harm. A column `Anmerkung` or `note` becomes the note shown next to the name; a column `Leitung` is skipped; any other column is refused, so that no day is lost unnoticed; a weekday none of the project days falls on names the registration's days. The **Template as of today** holds every teacher with address, abbreviation, days and note. **Check** shows each teacher's days before and new and lists the rows with a problem: without abbreviation or address, with an abbreviation the base data lacks, with a teacher who is not of the registration. Those rows are skipped, the others applied. Only **Apply** writes, for everyone in the file at once and as one entry in the log. Teachers and days not in the file stay as they are.

If a teacher lacks the abbreviation, or it differs from the list, set it here beside the name: **Edit**, enter the abbreviation, **Save abbreviation**. An abbreviation another teacher already has is refused.

## Publishing the catalogue

**Publish catalogue** closes submissions. The approved activities get their numbers and form the catalogue, which everyone can now see, including students. The name, school year and project days are now fixed. Before the step you see what it does and what is missing: no approved activity, a start in the past at which registration would open by itself right away. **Back to collecting** takes the publication back; numbers given stay, a new publication numbers only the rest.

![The catalogue: the registration name, project days and each activity's number, title, session, places, who it is for and cost](/bilder/en/katalog.png)

**View catalogue** shows it as students read it; **Print** prints it. **Catalogue as Excel** provides it as a spreadsheet ([Excel files](./excel)). You choose whether the catalogue names the teachers in the [settings](./einstellungen).
