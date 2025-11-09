# FairSplit Setup Guide

## Prerequisites

- Node.js 18+ and npm/yarn
- PostgreSQL database (local or cloud)
- Git

## Installation Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5433/fairsplit?schema=public"
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   DEEPSEEK_API_KEY="your-deepseek-api-key-here"
   ```
   
   **Getting DeepSeek API Key:**
   - Sign up at [DeepSeek Platform](https://platform.deepseek.com)
   - Create an API key from the dashboard
   - Add it to your `.env` file
   - Note: AI parsing is optional - the app will fallback to regex parsing if the key is not set

3. **Set up the database:**
   ```bash
   # Generate Prisma client
   npm run db:generate

   # Push schema to database (for development)
   npm run db:push

   # Or run migrations (for production)
   npm run db:migrate
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Database Setup

### Using Local PostgreSQL

1. Install PostgreSQL on your system
2. Create a database:
   ```sql
   CREATE DATABASE fairsplit;
   ```
3. Update `.env` with your connection string

### Using Cloud PostgreSQL (Recommended for Production)

- **Supabase**: Free tier available at [supabase.com](https://supabase.com)
- **Neon**: Free tier available at [neon.tech](https://neon.tech)
- **AWS RDS**: Managed PostgreSQL service

## Project Structure

```
fairsplit/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── bills/             # Bill view pages
│   ├── create/            # Create bill page
│   └── page.tsx           # Home page
├── components/            # React components
├── lib/                   # Utility functions
│   ├── prisma.ts         # Prisma client
│   ├── utils.ts          # Helper functions
│   ├── calculations.ts   # Bill calculation logic
│   └── api-client.ts    # Frontend API client
├── prisma/
│   └── schema.prisma     # Database schema
└── package.json
```

## Features Implemented

✅ Create bills with items
✅ Customizable tax & service charge (percentage-based)
✅ Shareable bill links
✅ Claim/unclaim items
✅ Provisional totals calculation
✅ Finalize bills
✅ Session-based authentication (no login required)
✅ Responsive UI with Tailwind CSS
✅ OCR receipt scanning (Tesseract.js)
✅ AI-powered bill parsing (DeepSeek AI)
✅ Fallback regex parsing

## Next Steps (Future Enhancements)

- [ ] Real-time collaboration (WebSockets)
- [ ] Payment link integration
- [ ] Export bills as PDF
- [ ] User accounts (optional)
- [ ] Bill history
- [ ] Integrate OCR/AI parsing into bill creation flow
- [ ] Support multiple languages for OCR
- [ ] Batch processing for multiple receipts

## Troubleshooting

### Database Connection Issues

- Verify PostgreSQL is running
- Check DATABASE_URL in `.env`
- Ensure database exists

### Prisma Issues

- Run `npm run db:generate` after schema changes
- Run `npm run db:push` to sync schema

### Build Errors

- Clear `.next` folder: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && npm install`

## Development

- API routes are in `app/api/`
- Frontend pages are in `app/`
- Components are in `components/`
- Database schema is in `prisma/schema.prisma`

## Production Deployment

1. Set up production database
2. Update environment variables
3. Run migrations: `npm run db:migrate`
4. Build: `npm run build`
5. Start: `npm start`

Recommended platforms:
- **Vercel** (frontend + API routes)
- **Railway** (backend + database)
- **Render** (full-stack)

