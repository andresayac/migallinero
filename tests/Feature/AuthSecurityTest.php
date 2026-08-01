<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_el_login_se_bloquea_tras_varios_intentos_fallidos(): void
    {
        User::factory()->create(['username' => 'jose', 'password' => 'contrasena-larga']);

        // El grupo `api` de Laravel 11+ no lleva throttle por defecto: sin el
        // limitador, /auth/login admitía intentos ilimitados de fuerza bruta.
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', [
                'username' => 'jose',
                'password' => 'incorrecta',
            ])->assertStatus(422);
        }

        $this->postJson('/api/auth/login', [
            'username' => 'jose',
            'password' => 'incorrecta',
        ])->assertStatus(429);
    }

    public function test_el_registro_exige_una_contrasena_de_al_menos_ocho_caracteres(): void
    {
        $this->postJson('/api/auth/register', [
            'name' => 'José',
            'username' => 'jose',
            'password' => '1234',
            'farm_name' => 'Los Laureles',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');
    }

    public function test_el_registro_crea_la_granja_con_los_catalogos_enviados_por_el_cliente(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'José',
            'username' => 'jose',
            'password' => 'contrasena-larga',
            'farm_name' => 'Los Laureles',
            'currency' => 'MXN',
            'timezone' => 'America/Mexico_City',
            'catalogs' => [
                'pens' => [
                    ['local_uuid' => 'uuid-galpon-1', 'name' => 'Galpón Norte', 'color' => '#0ea5e9'],
                ],
                'egg_categories' => [
                    ['local_uuid' => 'uuid-cat-1', 'name' => 'Grande', 'sellable' => true, 'is_broken' => false],
                ],
            ],
        ]);

        $response->assertCreated();

        // El servidor siembra EXACTAMENTE los catálogos del cliente, con sus
        // local_uuid: antes añadía los suyos y quedaban duplicados y sin enlazar.
        $pens = $response->json('boot.pens');
        $this->assertCount(1, $pens);
        $this->assertSame('Galpón Norte', $pens[0]['name']);
        $this->assertSame('uuid-galpon-1', $pens[0]['local_uuid']);

        $this->assertCount(1, $response->json('boot.egg_categories'));
        $this->assertSame('MXN', $response->json('farm.currency'));
    }

    public function test_la_contrasena_y_el_pin_se_guardan_hasheados(): void
    {
        $this->postJson('/api/auth/register', [
            'name' => 'José',
            'username' => 'jose',
            'password' => 'contrasena-larga',
            'farm_name' => 'Los Laureles',
        ])->assertCreated();

        $user = User::where('username', 'jose')->firstOrFail();

        $this->assertNotSame('contrasena-larga', $user->password);
        $this->assertTrue(Hash::check('contrasena-larga', $user->password));

        Sanctum::actingAs($user);

        $this->postJson('/api/auth/pin', [
            'pin' => '4321',
            'current_password' => 'contrasena-larga',
        ])->assertOk();

        $user->refresh();

        $this->assertNotSame('4321', $user->pin);
        $this->assertTrue(Hash::check('4321', $user->pin));
    }

    public function test_el_pin_se_verifica_de_verdad(): void
    {
        [$user, $farm] = $this->makeFarmUser();
        $user->update(['pin' => '1234']);

        Sanctum::actingAs($user);

        // Antes el candado de período aceptaba cualquier PIN, incluso vacío.
        $this->postJson('/api/auth/pin/verify', ['pin' => '9999'], $this->farmHeaders($farm))
            ->assertStatus(422)
            ->assertJson(['valid' => false]);

        $this->postJson('/api/auth/pin/verify', ['pin' => '1234'], $this->farmHeaders($farm))
            ->assertOk()
            ->assertJson(['valid' => true]);
    }

    public function test_el_usuario_sin_granja_recibe_403_en_vez_de_un_error_500(): void
    {
        $user = User::factory()->create();

        Sanctum::actingAs($user);

        // `bootData(Farm $farm)` recibía null y lanzaba un TypeError.
        $this->getJson('/api/auth/boot')->assertForbidden();
        $this->getJson('/api/auth/me')->assertForbidden();
    }

    public function test_el_login_sin_granja_devuelve_un_error_de_validacion(): void
    {
        User::factory()->create(['username' => 'huerfano', 'password' => 'contrasena-larga']);

        $this->postJson('/api/auth/login', [
            'username' => 'huerfano',
            'password' => 'contrasena-larga',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('username');
    }

    public function test_cambiar_la_contrasena_revoca_las_otras_sesiones(): void
    {
        [$user, $farm] = $this->makeFarmUser();
        $user->update(['password' => 'contrasena-larga']);

        $otherDevice = $user->createToken('otro-telefono');
        $current = $user->createToken('este-telefono');

        $this->withToken($current->plainTextToken)
            ->postJson('/api/auth/password', [
                'current_password' => 'contrasena-larga',
                'password' => 'nueva-contrasena',
                'password_confirmation' => 'nueva-contrasena',
            ], $this->farmHeaders($farm))
            ->assertOk();

        $this->assertNull($user->tokens()->find($otherDevice->accessToken->id));
        $this->assertNotNull($user->tokens()->find($current->accessToken->id));
    }
}
