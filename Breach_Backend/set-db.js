// setup-db.js
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Replace this with your actual Render External Database URL for running locally
const dbUrl = process.env.DATABASE_URL || "postgresql://user:uaUZN75OH4B6kKIp6FVeU42qYDAWUwsY@dpg-d73bbp4r85hc73emi550-a.oregon-postgres.render.com/nexora_45su";

const client = new Client({
    connectionString: dbUrl,
    ssl: { 
        // This is required to connect to a Render DB from your local machine
        rejectUnauthorized: false 
    }
});

async function runMigration() {
    try {
        console.log("⏳ Connecting to the database...");
        await client.connect();

        console.log("📖 Reading schema.sql file...");
        const sqlFilePath = "D:/breach/migrations/001_initial_schema.sql";
        const sql = fs.readFileSync(sqlFilePath, 'utf8');

        console.log("⚡ Executing SQL script...");
        await client.query(sql);

        console.log("✅ Database tables created successfully!");
    } catch (error) {
        console.error("❌ Error executing SQL:", error);
    } finally {
        await client.end();
        console.log("🔌 Database connection closed.");
    }
}

runMigration();