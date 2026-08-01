#!/bin/bash
php artisan clear-compiled
php artisan cache:clear
php artisan config:clear
php artisan event:clear
php artisan route:clear
php artisan schedule:clear-cache
php artisan view:clear
php artisan optimize:clear
