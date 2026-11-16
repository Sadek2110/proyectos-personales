import { test, expect } from '@playwright/test';

test('F03 portada visual abre la ruta y el asistente',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Entre murallas y mar'})).toBeVisible();
  expect(await page.locator('.hero img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Explorar la ruta'}).click();
  await expect(page.getByRole('heading',{name:'Rutas · Ceuta'})).toBeVisible();
  await page.getByRole('button',{name:'Inicio',exact:true}).click();
  await page.getByRole('button',{name:'Preguntar a la guía'}).click();
  await expect(page.getByRole('heading',{name:'Asistente'})).toBeVisible();
});

test('F01/F02 idioma persistente, chat y emergencias sin IA', async ({page})=>{
  await page.goto('/');
  await page.getByLabel('Idioma').selectOption('en');
  await page.getByRole('button',{name:'Assistant',exact:true}).click();
  await page.getByLabel('Your question').fill('What can I visit?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.getByTestId('messages')).toContainText('Explore Ceuta');
  await page.reload();
  await expect(page.getByLabel('Language')).toHaveValue('en');
  await page.getByRole('button',{name:'Emergency',exact:true}).click();
  await expect(page.getByRole('link',{name:'Call 112'}).first()).toHaveAttribute('href','tel:112');
  await expect(page.getByRole('link',{name:'Navigate'}).first()).toHaveAttribute('href',/google.com\/maps\/dir/);
});

test('F04 GPS, narración, progreso y retirada de consentimiento', async ({page,context})=>{
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({latitude:35.8885,longitude:-5.3210,accuracy:5});
  await page.goto('/');
  await page.getByLabel('Permitir ubicación durante las rutas').check();
  await page.getByRole('button',{name:'Rutas',exact:true}).click();
  await page.getByRole('button',{name:'Iniciar ruta'}).click();
  await page.getByRole('button',{name:'Activar GPS'}).click();
  await expect(page.getByTestId('arrivals')).toContainText('Murallas Reales');
  await expect(page.getByTestId('progress')).toContainText('1 / 3');
  await context.setGeolocation({latitude:35.8883,longitude:-5.3185,accuracy:5});
  await expect(page.getByTestId('progress')).toContainText('2 / 3',{timeout:15000});
  await context.setGeolocation({latitude:35.8897,longitude:-5.3070,accuracy:5});
  await expect(page.getByTestId('progress')).toContainText('3 / 3',{timeout:15000});
  await expect(page.getByTestId('progress')).toContainText('Completada');
  await page.getByLabel('Permitir ubicación durante las rutas').uncheck();
  await expect(page.getByRole('button',{name:'Activar GPS'})).toBeDisabled();
});

test('F06/F07 reserva, confirmación del operador y cancelación del visitante', async ({page,browser})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Reservas',exact:true}).click();
  await page.getByLabel('Nombre').fill('Ana Prueba');
  await page.getByLabel('Correo electrónico').fill('ana@example.com');
  await page.getByRole('button',{name:'Solicitar reserva'}).click();
  await expect(page.getByTestId('bookings')).toContainText('Solicitada');
  await expect(page.getByTestId('bookings')).toContainText('DEMO');
  const adminContext=await browser.newContext(); const admin=await adminContext.newPage();
  await admin.goto('/admin');
  await admin.getByLabel('Token de administración').fill('browser-test-admin');
  await admin.getByRole('button',{name:'Entrar'}).click();
  const card=admin.getByTestId('admin-booking').filter({hasText:'ana@example.com'});
  await card.getByRole('button',{name:'Confirmar'}).click();
  await expect(card).toContainText('Confirmada');
  await page.reload(); await page.getByRole('button',{name:'Reservas',exact:true}).click();
  await expect(page.getByTestId('bookings')).toContainText('Confirmada');
  await page.getByRole('button',{name:'Cancelar reserva'}).click();
  await expect(page.getByTestId('bookings')).toContainText('Cancelada');
  await adminContext.close();
});

test('F08 exportar y borrar datos; F09 widget y árabe',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/widget');
  await page.getByRole('button',{name:'Privacidad',exact:true}).click();
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar mis datos'}).click();
  expect((await download).suggestedFilename()).toBe('glovi-datos.json');
  await page.getByLabel('Confirmo que quiero borrar mis datos').check();
  await page.getByRole('button',{name:'Borrar mis datos'}).click();
  await expect(page.getByRole('status')).toContainText('Datos borrados');
  await page.getByLabel('Idioma').selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  await expect(page.getByRole('button',{name:'الطوارئ',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('F09 script insertable carga un widget con sesión funcional',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/embed-example.html');
  const frame=page.frameLocator('iframe[title="GLOVI · Ceuta"]');
  await frame.getByLabel('Tu consulta').fill('Qué visitar');
  await frame.getByRole('button',{name:'Enviar',exact:true}).click();
  await expect(frame.getByTestId('messages')).toContainText('Murallas');
  expect(errors).toEqual([]);
});

test('F04 GPS denegado y voz no disponible mantienen la guía utilizable',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'geolocation',{value:{watchPosition:(_ok:unknown,fail:(error:{code:number})=>void)=>{setTimeout(()=>fail({code:1}),0);return 1;},clearWatch:()=>{}}});
    Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel:()=>{}}});
  });
  await page.goto('/');
  await page.getByLabel('Permitir ubicación durante las rutas').check();
  await page.getByRole('button',{name:'Rutas',exact:true}).click();
  await page.getByRole('button',{name:'Iniciar ruta'}).click();
  await page.getByRole('button',{name:'Activar GPS'}).click();
  await expect(page.getByRole('status')).toContainText('No se pudo obtener la ubicación');
  await page.getByRole('button',{name:'Escuchar',exact:true}).first().click();
  await expect(page.getByRole('status')).toContainText('No hay una voz disponible');
  await expect(page.getByRole('link',{name:'Cómo llegar'}).first()).toBeVisible();
});

test('F01 error al guardar preferencias revierte el cambio y permite reintentar',async({page})=>{
  await page.goto('/');
  await page.route('**/api/preferences',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'error'}})}));
  await page.getByLabel('Idioma').selectOption('en');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Idioma')).toHaveValue('es');
  await page.unroute('**/api/preferences');
  await page.getByLabel('Idioma').selectOption('fr');
  await expect(page.getByLabel('Langue')).toHaveValue('fr');
});
