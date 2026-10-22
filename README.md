# StudySpace — Smart Study Planner

StudySpace is a small, beginner-friendly study planner built with HTML, CSS, and vanilla JavaScript. It runs in your browser and stores your tasks, focus-session history, and theme preference in LocalStorage. It does not need a server or an account.

## Project files

This project keeps the three requested files together in the project folder to make them easy to find while learning:

- `index.html` contains the page sections, navigation, forms, and timer controls.
- `style.css` contains the color theme, components, dark mode, and responsive layouts.
- `script.js` contains task management, filtering, scheduling, timer, recommendations, and progress calculations.

The project already uses this flat structure, so the CSS and JavaScript stay separate without introducing extra folders or build tools.

## Run in VS Code

1. Open this folder in VS Code.
2. Open `index.html` in a browser, or install the **Live Server** extension and choose **Open with Live Server**.
3. Add a task. It will still be there when you reload the page in the same browser.

## Features

- Dashboard totals, overall completion rate, today's progress, upcoming tasks, and study guidance.
- Create, edit, complete, search, sort, filter, export, and delete study tasks.
- Day, week, and all-task schedule views built from your actual tasks.
- Focus, short-break, and long-break timer modes. A completed 25-minute focus block records a session; every fourth session suggests a long break. Leaving the timer page pauses it.
- Progress charts, completion totals, tracked focus time, and milestones calculated from your saved tasks and sessions.
- Responsive layouts with a slide-in mobile navigation drawer, daily-task search and quick filters, keyboard-focus styles, validation, confirmation before deletion, toast feedback, and saved light/dark themes.

## How data is stored

The browser stores tasks under `studyspace.tasks`, focus sessions under `studyspace.sessions`, and the selected theme under `studyspace.theme`. Data stays in that browser profile and is not synchronized to other devices. Use **Export my tasks** in the profile menu to download a JSON copy of tasks and sessions.

Study time is counted when a full focus timer finishes. Manually completing a task updates task progress, but it does not claim additional focus minutes.

## A few JavaScript ideas used here

- **Arrays:** tasks and completed focus sessions are lists that the app filters and sorts.
- **Functions:** rendering functions refresh the dashboard, task list, schedule, and progress from the saved data.
- **Event listeners:** buttons and form fields call those functions when you interact with the page.
- **LocalStorage:** JSON converts the arrays to text for saving, then parses that text after the page loads.
- **CSS variables and media queries:** variables keep colors consistent, while media queries rearrange the layout for narrower screens.

## Current limits and next steps

The app is local-only: clearing browser storage removes saved data, and there are no user accounts or cloud sync. A timer must remain open to count down accurately. Future upgrades could add an account-backed sync service, optional reminders, calendar export, or study-plan suggestions using real course information.
