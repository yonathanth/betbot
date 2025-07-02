# PropertyBot - Telegram Property Listing Bot

A comprehensive Telegram bot for managing property listings with admin approval system and automatic channel posting.

## Features

### For Users

- 📝 **Easy Property Listing**: Step-by-step guided process to create property listings
- 🏠 **Property Types**: Support for both Residential and Commercial properties
- 📋 **Complete Details**: Title, location, price, contact info, and detailed descriptions
- ✅ **Status Updates**: Get notified when your listing is approved or needs changes

### For Admins

- 🛠 **Admin Panel**: Comprehensive dashboard with statistics
- ✏️ **Edit Posts**: Ability to edit any field of submitted listings
- ✅ **Approve/Reject**: Review and approve listings before publication
- 📊 **Statistics**: Track users, posts, and activity
- 🔔 **Notifications**: Get notified of new submissions

### System Features

- 📢 **Auto-Publishing**: Approved posts automatically published to channel
- 💾 **MySQL Database**: Robust data storage with proper indexing
- 🔒 **Admin Access Control**: Multiple admin support
- 📱 **User-Friendly**: Intuitive conversation flow
- 🚀 **Performance Optimized**: Database indexes for fast queries

## Installation

### Prerequisites

- Node.js (v14 or higher)
- MySQL database
- Telegram Bot Token
- Telegram Channel (for posting approved listings)

### Setup Steps

1. **Clone and Install**

   ```bash
   git clone <repository-url>
   cd betbot
   npm install
   ```

2. **Database Setup**

   - Create a MySQL database named `betbot`
   - The bot will automatically create required tables on first run

3. **Environment Configuration**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your configuration:

   ```env
   # Telegram Bot Configuration
   TELEGRAM_TOKEN=your_bot_token_here
   CHANNEL_ID=@your_channel_username_or_id

   # Admin Configuration (comma-separated telegram IDs)
   ADMIN_IDS=123456789,987654321

   # Database Configuration
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=betbot

   # Bot Configuration
   BOT_NAME=PropertyBot
   MAX_DESCRIPTION_LENGTH=4000
   ```

4. **Get Required IDs**

   - **Bot Token**: Create a bot via [@BotFather](https://t.me/botfather)
   - **Channel ID**: Create a channel and add your bot as admin
   - **Admin IDs**: Use [@userinfobot](https://t.me/userinfobot) to get your Telegram ID

5. **Start the Bot**

   ```bash
   npm start
   ```

   For development:

   ```bash
   npm run dev
   ```

## Bot Commands

### User Commands

- `/start` - Begin creating a property listing or register

### Admin Commands

- `/admin` - Access admin panel (admin only)

## User Flow

1. **Registration**: Name → Phone Number
2. **Property Type**: Choose Residential or Commercial
3. **Property Details**:
   - Title
   - Location
   - Price
   - Contact Information (optional)
   - Detailed Description
4. **Submission**: Post sent for admin review
5. **Review**: Admin can edit and approve/reject
6. **Publication**: Approved posts automatically posted to channel

## Admin Features

### Admin Panel

Access via `/admin` command:

- View statistics (users, posts, pending, published)
- Review pending posts
- Edit any field of submitted posts
- Approve or reject listings

### Post Editing

Admins can edit:

- Title
- Location
- Price
- Contact Information
- Description

### Approval Workflow

1. Admin receives notification of new submission
2. Admin reviews post in admin panel
3. Admin can edit fields if needed
4. Admin approves or rejects
5. Approved posts automatically published to channel
6. User gets notification of approval/rejection

## Database Schema

### Users Table

- `id` - Primary key
- `telegram_id` - Unique Telegram user ID
- `name` - User's name
- `phone` - User's phone number
- `is_admin` - Admin flag
- `created_at`, `updated_at` - Timestamps

### Posts Table

- `id` - Primary key
- `user_id` - Foreign key to users
- `property_type` - 'residential' or 'commercial'
- `title` - Property title
- `description` - Detailed description
- `location` - Property location
- `price` - Property price
- `contact_info` - Additional contact details
- `status` - 'pending', 'approved', 'rejected', 'published'
- `admin_notes` - Admin notes
- `created_at`, `updated_at`, `published_at` - Timestamps

### Post Images Table (Future)

- Ready for image support implementation

## Development

### Project Structure

```
betbot/
├── config/
│   └── database.js          # Database configuration
├── controllers/
│   ├── adminController.js   # Admin functionality
│   ├── postController.js    # Post creation logic
│   └── userController.js    # User registration
├── routes/
│   └── botRoutes.js        # Message routing
├── services/
│   ├── botService.js       # Bot core & state management
│   ├── channelService.js   # Channel posting service
│   └── dbService.js        # Database operations
├── package.json
├── server.js               # Application entry point
└── README.md
```

### Adding Features

- **Image Support**: Extend `post_images` table and add file handling
- **Categories**: Add property categories and filters
- **Search**: Implement search functionality
- **Analytics**: Add detailed analytics and reporting

## Error Handling

The bot includes comprehensive error handling:

- Database connection failures
- Telegram API errors
- User input validation
- Admin permission checks
- Graceful degradation

## Performance Optimizations

- Database indexes on frequently queried fields
- Connection pooling for database
- Efficient state management
- Error recovery mechanisms

## Security

- Admin access control via environment variables
- Input validation and sanitization
- SQL injection prevention via parameterized queries
- Error message sanitization

## Monitoring

Monitor these logs for bot health:

- Database connection status
- Message processing errors
- Admin notifications
- Channel posting success/failure

## Troubleshooting

### Common Issues

1. **Database Connection Failed**

   - Check MySQL is running
   - Verify credentials in `.env`
   - Ensure database exists

2. **Bot Not Responding**

   - Verify bot token is correct
   - Check bot has required permissions
   - Review console for errors

3. **Channel Posting Failed**

   - Ensure bot is admin in channel
   - Verify channel ID format
   - Check channel permissions

4. **Admin Commands Not Working**
   - Verify admin ID in `ADMIN_IDS`
   - Check admin ID format (numbers only)
   - Ensure proper comma separation for multiple admins

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review console logs for error messages
3. Verify all configuration settings
4. Check Telegram bot permissions

## License

ISC License
