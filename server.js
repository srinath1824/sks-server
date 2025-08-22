const express = require('express');
const cors = require('cors');
require('dotenv').config();
const connectDB = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Global error handler to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Feature flag for stateless mode (set via environment variable or config)
const USE_STATELESS_MODE = process.env.USE_STATELESS_MODE === 'true';

// Enable New Relic monitoring if feature flag is set
if (process.env.ENABLE_NEWRELIC === 'true') {
  // IMPORTANT: newrelic must be required before anything else
  require('newrelic');
  // Configure New Relic via newrelic.js or environment variables
}

/**
 * Stateless mode requirements:
 * - All backend instances must connect to the same MongoDB cluster.
 * - JWT_SECRET must be the same across all instances.
 * - No local file storage for user data (videos should be on CDN/cloud).
 * - Use /api/health for load balancer health checks.
 */

// Security middleware
// const corsOptions = {
//   origin: function (origin, callback) {
//     const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [];
//     console.log('CORS request from origin:', origin);
//     console.log('Allowed origins:', allowedOrigins);
    
//     // Allow requests with no origin (mobile apps, Postman, etc.)
//     if (!origin) return callback(null, true);
    
//     if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
//       return callback(null, true);
//     } else {
//       return callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// };

// app.use(cors(corsOptions));
app.use(cors({
  origin: true, // Allow all origins for now
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting middleware (basic)
const requestCounts = new Map();
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 1000; // per window
  
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, { count: 1, resetTime: now + windowMs });
  } else {
    const record = requestCounts.get(ip);
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count++;
      if (record.count > maxRequests) {
        return res.status(429).json({ error: 'Too many requests' });
      }
    }
  }
  next();
});

app.get('/', (req, res) => {
  res.send({ status: 'Backend server running!' });
});

// Health check endpoint for load balancers
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', stateless: USE_STATELESS_MODE });
});

// Add logging middleware for auth routes
app.use('/api/auth', (req, res, next) => {
  console.log(`Auth route: ${req.method} ${req.path}`);
  next();
});
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/events', require('./routes/events'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/event-registrations', require('./routes/eventRegistrations'));

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

connectDB().then(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('Process terminated');
    });
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
}); 