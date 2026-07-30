<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Seeder vacío para producción.
 *
 * Los usuarios reales se crean desde la app con /api/auth/register
 * (cada usuario crea su propia granja al registrarse).
 * No sembramos datos de prueba en producción.
 */
class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Intencionalmente vacío en producción.
        // Los usuarios se registran desde la app (endpoint /api/auth/register).
    }
}
