# Class teachers

The class teacher guides the class through a registration:

- sees who has already registered during registration;
- places anyone still short of time on a day after publication;
- records attendance;
- receives the emails listing missing choices and students in the class who are not fully placed yet.

The [Teachers](/en/lehrkraefte/klassenvorstand) handbook explains how.

![The classes with their class teachers and the form for adding a teacher as class teacher for 5A](/bilder/en/klassenvorstand-zuordnen.png)

## Assigning

1. Click **Link** in the class's row.
2. Find the teacher under **Add teacher**, by name or by abbreviation, and add them. A class can have several class teachers.
3. Click **Save**.

The organisation assigns class teachers in the same way; it reaches the page from a registration.

## From the class list

If the class lists' CSV file names a class teacher in the `class_teacher_email` column, that assignment applies here too. The table then adds “(from class list)”. A class teacher you assign here is added to the one from the class list.

## From a CSV file

![The section From a CSV file: the pasted list, followed by the check with each teacher's abbreviation and the Apply button](/bilder/en/klassenvorstaende-csv.png)

The teachers' abbreviations and the class teachers can also come from a file, one row per teacher:

- `email`: the teacher's e-mail address as the class lists have it;
- `short_name`: the abbreviation, up to 8 characters; the teacher search then finds a teacher by it too, and the tables show it;
- `class`: the class they are class teacher of; two rows for two classes.

Only `email` is required. A list from the school's administration software with the columns “Address Email”, “Name” (the abbreviation) and “Kv Von” is read just the same; other columns are left out, and the check says so. The **Template as of today** holds every teacher of the class lists with their abbreviations and classes, to be completed in Excel.

Choose the file or paste its content and click **Check**. The check shows each teacher's new abbreviation and, per class, the class teachers before and new; rows with a problem (an address missing from the class lists, an unknown class, an abbreviation another teacher holds) are listed above. Only **Apply** writes: for every class in the file, its class teachers are then exactly those of the file; classes not in the file stay as they are, and a class teacher from the class list stays alongside.
