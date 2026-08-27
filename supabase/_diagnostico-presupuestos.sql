-- Solo lectura, no cambia nada. Copia el resultado completo y pásamelo.

select conname as restriccion
from pg_constraint
where conrelid = 'presupuestos'::regclass;

select column_name, is_nullable
from information_schema.columns
where table_name = 'presupuestos'
order by ordinal_position;

select count(*) as filas_totales,
       count(mes) as filas_con_mes,
       count(*) filter (where mes is null) as filas_sin_mes
from presupuestos;
