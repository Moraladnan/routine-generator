# Course Routine Planning Requirements

## Goal

Create possible class routines using the following six courses:

| Course | Credit |
| ------ | ------ |
| CSE261 | 3      |
| CSE263 | 3      |
| CSE264 | 1      |
| MAT261 | 3      |
| CSE265 | 3      |
| CSE266 | 1      |

**Total Credit:** 14  
**Total Courses:** 6

---

# Constraints

## 1. Number of Days

- Classes should be completed within exactly **4 days per week**.
- Consecutive days are preferred.

Preferred day order:

- Saturday
- Sunday or Monday
- Tuesday or Wednesday
- Thursday

---

## 2. Time Limit

- Earliest class start: **10:00 AM**
- Latest class finish: **4:20 PM**

Any routine containing a class ending after **4:20 PM** is invalid.

---

## 3. No Large Time Gaps

Classes on the same day should be consecutive.

### Allowed gaps

- 10-minute transition break between consecutive periods.
- Official 40-minute break (12:50 PM to 1:30 PM).

Large idle periods (> 60 minutes) should be minimized.

### Good Example ✅

| Time                |
| ------------------- |
| 10:00 AM - 11:20 AM |
| 11:30 AM - 12:50 PM |
| 1:30 PM - 3:50 PM   |

### Bad Example ❌

| Time              |
| ----------------- |
| 8:30 AM - 9:50 AM |
| 1:30 PM - 4:20 PM |

---

## 4. Course Selection Rules

Exactly one section must be selected from each course:

- One CSE261 section
- One CSE263 section
- One CSE264 section
- One MAT261 section
- One CSE265 section
- One CSE266 section

---

## 5. Faculty Dependency Rules (Hard Constraint)

Theory and lab sections are independent.

---

## 6. Faculty Information

Faculty information must be included in every generated routine.

Example:

- CSE261.1 ([FUZ] Farhad Uz Zaman)
- CSE266.4([MAIM] Maisha Muntaha)

---

## 7. Optimization Priority

Rank routines by the following priority:

1. Exactly **4 class days**.
2. Finish all classes by **4:20 PM**.
3. Minimize total weekly idle time.
4. Prefer consecutive classes.
5. Avoid single-class days.
6. Prefer consecutive weekdays.
7. Satisfy faculty dependency constraints.
