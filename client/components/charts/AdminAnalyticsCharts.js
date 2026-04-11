'use client';

import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart
} from 'recharts';

const chartCardClassName =
  'rounded-2xl border border-red-100/80 bg-white/85 p-4 shadow-[0_20px_45px_-34px_rgba(153,27,27,0.55)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/75';

export default function AdminAnalyticsCharts({ attendanceSeries = [], feeSeries = [], growthSeries = [] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <motion.section
        className={chartCardClassName}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-red-700 dark:text-red-200">Attendance Trend</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={attendanceSeries}>
              <defs>
                <linearGradient id="attendanceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.85} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.08} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(239,68,68,0.12)" />
              <XAxis dataKey="label" stroke="#b91c1c" tick={{ fontSize: 12 }} />
              <YAxis stroke="#b91c1c" tick={{ fontSize: 12 }} domain={[0, 100]} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #fecaca' }} />
              <Area type="monotone" dataKey="value" stroke="#dc2626" strokeWidth={2.2} fill="url(#attendanceGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.section>

      <motion.section
        className={chartCardClassName}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-red-700 dark:text-red-200">Fee Collection</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={feeSeries}>
              <defs>
                <linearGradient id="feeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f87171" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#991b1b" stopOpacity={0.75} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(239,68,68,0.12)" />
              <XAxis dataKey="label" stroke="#b91c1c" tick={{ fontSize: 12 }} />
              <YAxis stroke="#b91c1c" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #fecaca' }} />
              <Bar dataKey="value" fill="url(#feeGradient)" radius={[10, 10, 4, 4]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.section>

      <motion.section
        className={`lg:col-span-2 ${chartCardClassName}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08 }}
      >
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-red-700 dark:text-red-200">Student Growth</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={growthSeries}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(239,68,68,0.12)" />
              <XAxis dataKey="label" stroke="#b91c1c" tick={{ fontSize: 12 }} />
              <YAxis stroke="#b91c1c" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #fecaca' }} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#dc2626"
                strokeWidth={2.4}
                dot={{ r: 4, fill: '#991b1b' }}
                activeDot={{ r: 6, fill: '#ef4444' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.section>
    </div>
  );
}
