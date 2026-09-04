# Delta de spec: despliegue

> **Coordinación con T-013.** La capacidad `despliegue` **no está consolidada** en `openspec/specs/`: hoy vive en el change en curso `preparar-deploy-produccion` (T-013), en otro árbol de trabajo, y es ese change el que crea `docs/despliegue.md`. Por eso estos requirements se escriben como ADDED contra lo consolidado (que es nada). Al consolidar:
>
> - si **T-013 se mergea primero**, estos dos requirements se integran a la capacidad ya existente y su contenido es una sección más del documento que T-013 creó, sin duplicar el checklist de variables;
> - si **este change se mergea primero**, T-013 debe encontrar la sección de activación ya escrita y sumar su checklist alrededor, sin pisarla ni moverla al camino obligatorio del despliegue.
>
> En cualquiera de los dos órdenes, la sección de la verificación por SMS es **opcional y posterior al lanzamiento**: el sitio se despliega y se lanza sin ella.

## ADDED Requirements

### Requirement: La activación de la verificación por SMS está documentada como paso opcional posterior al lanzamiento

`docs/despliegue.md` DEBE tener una sección propia para encender la verificación por SMS (ADR-011), marcada de forma inequívoca como **opcional y posterior al lanzamiento**: el despliegue de producción se completa sin ella y el checklist obligatorio NO DEBE incluirla. La sección DEBE explicar, en orden y en español llano, lo que un humano tiene que hacer:

- que con la bandera apagada el sitio se comporta exactamente como el flujo manual del PRD §6.3 y el costo es cero;
- crear la cuenta del proveedor y dar de alta un servicio de Verify, con los requisitos de registro A2P para mandar SMS a México;
- las variables que hay que poner (`VERIFICACION_SMS_ACTIVA`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `VERIFICACION_SMS_SECRETO` y el tope diario configurable), cuáles son **secretos** y que ninguna se commitea;
- el costo aproximado por verificación (~$0.05 USD por SMS a México más los cargos del registro A2P), que es el dato que decide si se enciende;
- el orden correcto: primero las credenciales, al final la bandera, porque con la configuración a medias la capacidad se queda apagada y solo deja una advertencia en el log;
- cómo apagarla: quitar la bandera devuelve el flujo manual sin migración ni pérdida de datos, y las fichas ya verificadas conservan su marca;
- las dos advertencias que no son obvias: que **el tope diario se cuenta por proceso**, así que con varias instancias el gasto real puede ser un múltiplo del tope; y que, con la capacidad encendida, el embudo del PRD §10 pierde a quien abandone en la pantalla del código, de modo que una caída de vistas de `/registro/gracias` no significa una caída de registros (el conteo contable es la base de datos);
- que la publicación de las fichas **sigue siendo del admin** aunque el número esté verificado, y que la revisión por WhatsApp no se elimina.

#### Scenario: el humano decide con los números a la vista

- **WHEN** el humano abre `docs/despliegue.md` para decidir si enciende la verificación por SMS
- **THEN** encuentra la sección marcada como opcional y posterior al lanzamiento, con el costo aproximado por verificación, los requisitos A2P, las variables en orden y cómo apagarla

#### Scenario: el checklist del lanzamiento no la pide

- **WHEN** alguien sigue el checklist obligatorio de despliegue de punta a punta
- **THEN** llega a producción sin haber configurado nada del proveedor de SMS, y el sitio funciona con el flujo manual de siempre

#### Scenario: la advertencia del gasto está escrita

- **WHEN** el humano lee la sección de activación
- **THEN** encuentra dicho, con todas sus letras, que el tope diario se cuenta por proceso y que con varias instancias el gasto puede ser mayor que el tope

### Requirement: `.env.example` documenta el bloque de la verificación por SMS y su fail-safe

`.env.example` DEBE documentar, en su propio bloque y con el mismo tono de los bloques que ya existen (panel y analítica), las variables de la verificación por SMS: para qué es cada una, **cuáles son secretos y nunca se commitean**, que el estado por defecto es apagado, que sin la bandera o con las credenciales a medias el sitio corre exactamente igual sin verificar nada y dejando una advertencia en el log, que la bandera se prende al final, y que cada SMS cuesta dinero, con el enlace o la referencia a la sección de activación de `docs/despliegue.md`. Los valores de ejemplo DEBEN ir comentados y NO DEBEN servir como credenciales reales.

#### Scenario: el humano sabe qué poner y qué no

- **WHEN** el humano abre `.env.example` para encender la verificación
- **THEN** encuentra las variables comentadas con su explicación, la advertencia de que son secretos, la nota de que sin ellas nada se rompe y no se mide ningún costo, y la referencia a la sección de activación

#### Scenario: ningún secreto de verdad en el repositorio

- **WHEN** se revisa `.env.example` y el resto del repositorio
- **THEN** no hay ninguna credencial del proveedor con un valor real, ni siquiera de ejemplo funcional
