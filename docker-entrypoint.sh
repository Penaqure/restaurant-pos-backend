#!/bin/sh
set -e

echo "Running database migrations..."
npx sequelize-cli db:migrate

echo "Checking seed data..."
node scripts/ensure-seed-data.js

echo "Ensuring super admin account..."
node utils/scripts/createSuperAdmin.js

echo "Starting server..."
exec node app.js
