# Class lists

The class lists tell SchulWahl who is at the school: all students with their class and year, and all teachers. Only people in the class lists take part in a registration. They come from the school's **Entra groups** or a **CSV file**. Both routes end the same way: SchulWahl shows you the imported list for review, and it only takes effect when you apply it.

## From Entra groups

If the school keeps its classes as groups in Microsoft Entra, this is the simpler route: the groups already identify every account, and no one needs to be recognised on first sign-in.

### Entering the groups

![The Entra groups section with the table of groups, the buttons and the import below](/bilder/en/entra-gruppen.png)

1. Click **Add group**.
2. Enter the **Group ID**. You can find it in Entra under the group, as its object ID. Or search Microsoft for the group (below).
3. Give it a **Name**, choose the **Kind** (a class or the teachers) and enter the **Class** and **Year** for a class. The teachers' group has neither.
4. Click **Save groups**.

SchulWahl also reads subgroups. Enter a class only once: either its group or its subgroups (3A, or 3AR and 3AG), otherwise each person appears twice in the list.

### Searching Microsoft for groups

![The group search: a field for the start of the name, the class groups found with their class and year, and a button to apply each one](/bilder/en/gruppen-suchen.png)

**Search Microsoft for groups** takes you to Microsoft once to sign in. You then search for groups by the start of their name. **Find all class groups** finds every group whose name is a class (5A, 1B and so on), and fills in the class and year from the name: 5A becomes Year 9. Check the suggested values, apply the groups one at a time or all at once, and save.

### Importing

Under **Import from Entra groups**, enter the **School year** (2026/27) and click **Import now**. Microsoft asks whether SchulWahl may read the group members with your account; the page lists the permissions involved. SchulWahl then shows the import for review.

If the page says that Microsoft refuses to read the groups, permissions or IT consent in Entra are missing. The operator sets this up as described in the operations guide.

## From a CSV file

![The Upload CSV file section with the template link, file field, pasted content and school year](/bilder/en/csv-hochladen.png)

One row per person, with the columns from the **Template** you download on the page:

```csv
email;given_name;family_name;class;grade;kind;class_teacher_email
sara.schuelerin@schule.example.org;Sara;Schülerin;5A;9;student;anna.lehrerin@schule.example.org
anna.lehrerin@schule.example.org;Anna;Lehrerin;;;teacher;
```

- `kind` is `student` or `teacher`. Teachers have neither a class nor a year.
- `class_teacher_email` is optional and names the class's [class teacher](./klassenvorstaende).
- The separator is a semicolon or a comma.

Upload the file or paste its content, enter the **School year** and click **Import**. On first sign-in, SchulWahl recognises each person by their school email address, exactly as it appears in the list. Anyone who signs in with an account that has a different address stays unlinked; you then link the account under [Accounts and roles](./konten-und-rollen).

## Reviewing and applying an import

![An import from Entra groups: changes from the current class lists, with new and removed people, and the Apply and Discard buttons](/bilder/en/import-pruefen.png)

The import shows what changes from the current class lists: who is **new**, who is **removed** and whose class, year, name or address has **changed**.

- **Problems**, such as students without a class or the same person twice, cause the whole list to be rejected, with the line where they occur. Fix them in the source and import again.
- **Notes** do not stop the import. A person without an email address, for example, will not receive emails.
- **Apply** makes the list the current class lists at once. **Discard** leaves everything as it was.

If another import has been applied since this one was imported, you can no longer apply this one. Import the class lists again.

## The imports

![The imports table with time, source, school year, people, changes and status](/bilder/en/importe.png)

Every import stays in the list with its status: for review, applied, discarded or rejected. **View** opens it.

## What a new list changes

- Anyone new in the list takes part from now on, even in a registration that is already open.
- Anyone missing from the new list keeps their account. Accounts and roles then shows “Not in the current class lists”, and the person takes part in nothing until a list includes them again. Their choices and allocation stay.
- When a registration ends, SchulWahl freezes the class lists then in effect for it. A later list no longer changes that registration's allocation.
