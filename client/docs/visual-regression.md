# Visual Regression Workflow

This workflow creates visual baseline screenshots for key pages and captures candidate screenshots for UI review.

## 1) Install Browser Binaries (first time only)

```bash
npm run visual:install
```

## 2) Capture Baseline

Use this after a confirmed-good UI state.

```bash
npm run visual:baseline
```

Baseline screenshots are stored in:

- `client/visual-regression/baseline/`

## 3) Capture Candidate Screenshots

Use this after a redesign or UI change.

```bash
npm run visual:candidate
```

Candidate screenshots are stored in:

- `client/visual-regression/candidate/YYYY-MM-DD/`

## 4) Optional Authenticated Route Capture

By default, only public routes are captured when role tokens are not provided.

Set environment variables to include protected routes:

- `VISUAL_ADMIN_TOKEN`
- `VISUAL_TEACHER_TOKEN`
- `VISUAL_STUDENT_TOKEN`

Optional user payload overrides:

- `VISUAL_ADMIN_USER`
- `VISUAL_TEACHER_USER`
- `VISUAL_STUDENT_USER`

Example:

```bash
VISUAL_ADMIN_TOKEN=... VISUAL_TEACHER_TOKEN=... VISUAL_STUDENT_TOKEN=... npm run visual:candidate
```

PowerShell example:

```powershell
$env:VISUAL_ADMIN_TOKEN="..."; $env:VISUAL_TEACHER_TOKEN="..."; $env:VISUAL_STUDENT_TOKEN="..."; npm run visual:candidate
```

## 5) Manual Review Checklist

- Compare baseline and candidate screenshots route-by-route.
- Check desktop and mobile versions.
- Verify no layout breakage in table-heavy pages.
- Verify dark mode readability and contrast.
- Verify action controls remain visible and clickable.
- Verify forms preserve spacing, labels, and validation hints.
- Verify no clipping on sidebar, modals, or sticky headers.

## Captured Route Groups

- Public: `/`, `/about-us`, `/contact-us`, `/login`
- Admin: `/admin/dashboard`, `/admin/fees`, `/admin/marks`, `/admin/notices`
- Teacher: `/teacher/dashboard`
- Student: `/student/dashboard`
