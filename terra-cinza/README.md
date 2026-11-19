# Terra Cinza

Aventura de ação com visão de cima, em pixel art, num mundo pós-apocalíptico. Jogo original feito com
HTML5 Canvas e JavaScript puro, num único arquivo, sem dependências nem build. Roda no navegador do
computador (teclado) e do celular (controles de toque).

## Como jogar

Abra `terra-cinza/index.html` em qualquer navegador moderno. Não é preciso instalar nada nem rodar servidor.
A fonte vem do Google Fonts; sem internet o jogo usa uma fonte monoespaçada de reserva.

### Controles

| Ação | Teclado | Celular |
|---|---|---|
| Mover | WASD ou setas | Direcional à esquerda |
| Golpe / falar / avançar diálogo | J, Espaço, Z ou Enter | Botão A |
| Usar item (estilingue ou gancho) | K ou X | Botão B |
| Trocar item | Q ou L | Botão TROCA |
| Pausa | P ou Esc | Botão PAUSA |
| Som e música | M | Botão SOM |

O progresso é salvo automaticamente no navegador (`localStorage`). Ao desmaiar, você volta ao acampamento
sem perder itens.

## História

Ano 41 depois do Apagão. Ravi, catador de sucata do Acampamento Brasa, precisa recuperar duas peças do
gerador antes que o acampamento congele:

1. O **Núcleo de Fusão**, no Bunker 7, a nordeste, guardado pelo Colosso de Sucata.
2. A **Bobina de Ignição**, na Usina Afogada, ao sul do rio ácido, guardada pela Carapaça.

O jogo termina quando você entrega as duas peças à Vó Iara.

## Conteúdo

- **Superfície:** 10 telas (acampamento, lago verde, ruínas, bosque, ferro-velho, pântano, rodovia,
  clareira e rio ácido), com transição deslizante entre telas.
- **Masmorras:** Bunker 7 (6 salas) e Usina Afogada (5 salas), com porta trancada por cartão de acesso,
  olho na parede que abre portões quando atingido pelo estilingue e travessias com gancho.
- **Itens:**
  - Chave inglesa: ataque corpo a corpo; corta mato de ferro e abre baús.
  - Estilingue: tiro à distância que gasta sucata como munição.
  - Gancho de escalada: preso num poste de ferro, puxa você por cima da água; também atordoa
    criaturas, vira cascos blindados e puxa itens de longe.
  - Duas células de energia extras escondidas aumentam a vida máxima.
- **Inimigos:** ratos mutantes, drones de sucata, cuspidores tóxicos e besouros blindados
  (só levam dano depois de virados pelo gancho).
- **Chefes:** Colosso de Sucata (investe, fica atordoado ao bater na parede e solta rajadas) e
  Carapaça (descargas elétricas e investidas; vulnerável só depois de virada pelo gancho).
- **Áudio:** efeitos sintetizados e três trilhas originais (superfície, masmorras e chefes) com Web Audio.

## Estrutura do código

Tudo fica em `index.html`, dividido em seções comentadas dentro do `<script>`:

| Seção | Conteúdo |
|---|---|
| `palette` | Cores de todo o jogo |
| `world` (`ROOMS`) | Mapas 16×11 de cada tela, inimigos, baús, portas e teleportes |
| `sprites` / `tiles` | Personagens em mapas de caracteres e terreno desenhado por código |
| `audio` | Efeitos e sequenciador de música |
| `save` | Salvamento em `localStorage` |
| `entities` / `player` | Inimigos, chefes, combate, itens e gancho |
| `update` / `render` | Lógica por quadro e desenho |

### Criando uma nova tela

Adicione uma entrada em `ROOMS` com a chave `área + x,y` (`o` superfície, `d` Bunker 7, `u` Usina).
Cada mapa tem 11 linhas de 16 caracteres; a legenda está no comentário acima de `ROOMS`.
As saídas precisam coincidir com a borda da tela vizinha: uma abertura na borda leste de `o1,1`
exige a mesma abertura na borda oeste de `o2,1`.
