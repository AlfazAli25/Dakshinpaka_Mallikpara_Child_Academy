# School Management System (Next.js + Express + MongoDB)

This workspace contains a full-stack School Management System implementation aligned with your module/API/schema workflow.

## Project Structure

- `client/` – Next.js frontend (App Router + Tailwind + GSAP table animation)
- `server/` – Express backend (Controller/Service/Model architecture with MongoDB)

## Backend Highlights (`server/`)

### Core Modules and Endpoints

- Auth & Users
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/forgot-password/request-otp`
  - `POST /api/auth/forgot-password/verify-otp`
  - `GET /api/users/:id`
  - `PUT /api/users/:id`
- Students
  - `GET /api/students`
  - `GET /api/students/:id`
  - `POST /api/students`
  - `PUT /api/students/:id`
  - `DELETE /api/students/:id`
- Teachers
  - `GET /api/teachers`
  - `GET /api/teachers/:id`
  - `POST /api/teachers`
  - `PUT /api/teachers/:id`
  - `DELETE /api/teachers/:id`
- Classes & Subjects
  - `GET /api/classes`
  - `POST /api/classes`
  - `GET /api/classes/:id`
  - `PUT /api/classes/:id`
  - `DELETE /api/classes/:id`
  - `GET /api/subjects`
  - `POST /api/subjects`
  - `GET /api/subjects/:id`
  - `PUT /api/subjects/:id`
  - `DELETE /api/subjects/:id`
- Attendance
  - `GET /api/attendance?studentId=...&date=...`
  - `POST /api/attendance`
  - `PUT /api/attendance/:id`
- Timetables
  - `GET /api/timetables/:classId`
  - `POST /api/timetables`
  - `PUT /api/timetables/:id`
  - `DELETE /api/timetables/:id`
- Exams & Grades
  - `GET /api/exams?classId=...`
  - `POST /api/exams`
  - `PUT /api/exams/:id`
  - `GET /api/grades?examId=...`
  - `POST /api/grades`
  - `PUT /api/grades/:id`
- Fees
  - `GET /api/fees?studentId=...`
  - `POST /api/fees`
  - `PUT /api/fees/:id`
- Optional HR/Staff
  - `GET /api/staff`, `POST /api/staff`
  - `GET /api/payroll`, `POST /api/payroll`

### Architecture

- `routes/` – endpoint mapping and route-level protection
- `controllers/` – request/response handlers
- `services/` – business logic and DB operations
- `models/` – Mongoose schemas/collections
- `middleware/` – JWT auth, role checks, validation, global errors

### Security and Validation

- Password hashing with `bcryptjs`
- JWT auth with role-based access (`admin`, `teacher`, `student`, `parent`)
- Forgot password OTP flow verified via admin email before password reset
- Input validation with `express-validator`

## Frontend Highlights (`client/`)

### Auth Pages

- `/login`
- `/register`

### Admin Pages

- `/admin/dashboard`
- `/admin/students`
- `/admin/students/[studentId]`
- `/admin/teachers`
- `/admin/classes`
- `/admin/fees`

### Teacher Pages

- `/teacher/dashboard`
- `/teacher/attendance`
- `/teacher/exams`
- `/teacher/grades/[examId]`
- `/teacher/timetable`

### Student Pages

- `/student/dashboard`
- `/student/timetable`
- `/student/results`
- `/student/attendance`
- `/student/fees`

### Parent Pages

- `/parent/dashboard`
- `/parent/attendance`
- `/parent/results`

### Shared UI

- Reusable components: `Sidebar`, `AppShell`, `Input`, `Select`, `Table`, `StatCard`
- Tailwind-based layout/styling
- GSAP row fade-in animation in table component

## Setup

## 1) Backend

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

Backend runs at `http://localhost:5000`.

## 2) Frontend

```bash
cd client
cp .env.example .env.local
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`.

## Required Environment Variables

### Backend (`server/.env`)

- `PORT`
- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `CLIENT_ORIGIN`
- `ADMIN_EMAIL` (optional; fallback is first admin email in DB)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM` (optional)
- `SMTP_SECURE` (optional; `true` for SSL/TLS transport)
- `CLOUDINARY_CLOUD_NAME` (required for static QR screenshot uploads)
- `CLOUDINARY_API_KEY` (required for static QR screenshot uploads)
- `CLOUDINARY_API_SECRET` (required for static QR screenshot uploads)
- `CLOUDINARY_FOLDER` (optional; defaults to `sms/payment-screenshots`)

### Frontend (`client/.env.local`)

- `NEXT_PUBLIC_API_BASE_URL` (e.g. `http://localhost:5000/api`)

## Notes

- MongoDB indexes are added for common query paths (`studentId`, `classId`, `date`, etc).
- API responses are JSON with status codes and `success` flags.
- Static QR screenshots are stored in Cloudinary and only their URL/public ID are saved in MongoDB.
- This scaffold is production-structured and ready for feature-level enhancements (analytics, notifications, report cards, etc.).
