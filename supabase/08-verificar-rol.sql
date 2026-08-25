-- =====================================================================
-- Diagnostico: revisa el rol actual de cada usuario registrado.
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

select p.nombre, u.email, p.rol, p.creado_en
from perfiles p
join auth.users u on u.id = p.id
order by p.creado_en;

-- Si tu correo NO aparece como 'admin', corrige con esto
-- (cambia el correo si hace falta) y vuelve a correr el select de arriba:

update perfiles
set rol = 'admin'
where id = (select id from auth.users where email = 'calejandro.garza@grupoabsa.com');
