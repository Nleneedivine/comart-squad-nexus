# Comart+ Hub

Foundation — Auth, Layout, Dashboard, Staff & Settings

Covers: Auth · Sidebar nav · Dashboard · Staff management · Account settings

Build a Nigerian business management SaaS called "Comart+" with a dark sidebar layout using teal (#1D9E75) as the brand color and Nigerian Naira (₦) as currency throughout.

AUTHENTICATION
- Email/password signup and login via Supabase Auth, google login (divinenlenee@gmail.com as admin. once signed up)
- On signup, create a "store" record linked to the user (store owner)
- Support multiple staff roles: Sales Rep, Manager, HR, Inventory Manager, Marketer, Order Manager, Customer Care, Logistics Manager, Accountant, Head Of Operations

LAYOUT
- Collapsible left sidebar with sections: Dashboard, My Attendance, My Store (Products, Orders), Orders, Businesses, Customer Service, Marketing (Sales Forms), Wallet, Inventory (Products, Buy Stock, Stock Record, Faulty Stocks, Agent Stock Table, Waybill), Agents, Finance, Staff Management, Chat Room, Reports (Data Export, Store Activity Log), Productivity, Integrations, Webhooks, Settings
- Top bar showing store name, logged-in user roles, notification bell, and "My Store" profile dropdown (Settings, Performance, Account Walkthrough, Documentation, Calculator, Support, Light Mode toggle, Logout)

DASHBOARD PAGE (/Dashboard)
- 6 KPI cards: Expected Revenue (₦), Actual Revenue (₦), Total Orders, Total Delivered Units, Average Order Value (₦), Total Stock Unit
- "Orders and Revenue Trends" line chart — dual axis, Revenue (teal) and Orders (dark), filterable by Today/Week/Month/Year date picker
- Order Status panel (right): Delivered count, delivery rate percentage badge
- Latest Orders panel (right): recent order list
- Bottom: "Top 3 Best Performing Staff" and "Top 3 Best Performing Agents" cards


STAFF MANAGEMENT
- Invite staff by email with role assignment
- Staff list table with name, role, status, attendance summary
- My Attendance page: clock in/clock out, attendance history calendar

ACCOUNT SETTINGS (/Settings)
- My Profile tab: avatar upload (warn profile pic locked for 30 days after set), full name, email, phone, community display name
- General Settings sub-menu in sidebar under Settings

Supabase Auth Multi-role Dashboard Charts Staff

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://comart-squad-nexus.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/17824584-4925-45c1-8dbf-b9261886ac5b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
