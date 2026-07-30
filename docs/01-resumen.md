# 01 — Resumen funcional del proyecto

## Mi Gallinero

PWA **instalable y offline-first** para administrar granjas avícolas en Colombia.
La usa principalmente un **adulto mayor** con poca experiencia tecnológica, pero
también familiares, operarios y vendedores.

**La app se comparte con mucha gente; cada quien crea SU granja.** Cada usuario
registra su propia granja y queda como administrador de ella. Nadie ve los datos
de otra granja. En el futuro, una empresa podrá tener varios galpones y asignar
empleados a cada uno con roles.

## Objetivo

Que cualquier persona (niño, joven o adulto mayor) pueda, **sin capacitación**:

- Crear y configurar **su propia granja** al registrarse.
- Registrar la **producción diaria de huevos** por categoría.
- Saber en todo momento **cuántos huevos hay** para vender.
- Controlar el **inventario de gallinas** y la **mortalidad**.
- Anotar **vacunaciones** y **novedades** del corral.
- **Vender**, cobrar y llevar el registro de **clientes** y **deudas**.
- Ver **reportes** sencillos con números grandes.

## Granjas aisladas (preparado para multi-granja futuro)

- Tablas: `farms` (granjas), `farm_user` (N:N usuario↔granja con rol, **futuro**).
- Cada registro operativo lleva `farm_id` para aislar los datos desde el MVP.
- En el MVP cada usuario tiene **una sola granja** (creada al registrarse);
  no se muestra selector de granja todavía.
- Caso avanzado futuro: una empresa con varios galpones asigna empleados
  por granja y estos eligen la granja activa al iniciar sesión.
- Los catálogos configurables (categorías de huevo, causas, corrales) son **por granja**.

## Principios de UX

1. Botones grandes con icono y texto.
2. Una sola tarea por pantalla.
3. Números grandes y fáciles de leer.
4. Controles de +/− y teclado numérico.
5. Confirmaciones claras y registro editable.
6. Lenguaje cotidiano, sin términos contables.
7. Botón "Inicio" siempre visible.
8. Modo Simple (adulto mayor) y Modo Administrativo.

## Soporte

- Funciona en Android, PC y tableta.
- Soporta **conexión lenta o intermitente** con sincronización posterior.
- Moneda en pesos colombianos (COP) y formato de fecha/hora de Colombia.
