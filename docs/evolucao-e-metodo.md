# Evolução e método de trabalho

[Início](../README.md) · [Aplicativo](aplicativo.md) · [Engenharia](engenharia.md) · [Resultados](resultados.md)

O trabalho liga um problema de reaproveitamento de materiais a uma aplicação implementada. O processo combina pesquisa documental, definição de requisitos, prototipação, desenvolvimento iterativo e avaliação técnica.

## Problema, público e pesquisa

Materiais ainda utilizáveis podem perder oportunidades de reaproveitamento quando quem os possui não encontra interessados. O HandMade foi concebido para pessoas em reformas, artesãos, profissionais da construção e empresas com excedentes ou necessidade de materiais.

A economia circular orienta a proposta de manter materiais em uso. A pesquisa documental incluiu referências sobre circularidade, resíduos, soluções existentes, experiência do usuário e privacidade. A legislação foi considerada como contexto do projeto, sem apresentar a aplicação como certificada ou como substituta de orientação jurídica.

A análise de mercado identificou soluções do segmento, incluindo o Resto de Obra. Assim, a justificativa do HandMade se apoia no recorte de público e na experiência proposta, sem afirmar inexistência de concorrentes ou superioridade comprovada.

### O que a pesquisa permite afirmar

O levantamento documental e a análise de alternativas foram aproveitados na definição do escopo. Os materiais antigos também mencionam questionários, entrevistas e avaliações com participantes, mas os registros primários disponíveis são insuficientes para sustentar publicamente seus números e conclusões. Por isso, não são usados como prova de aceitação ou usabilidade do aplicativo final.

Essa distinção faz parte do método: personas e hipóteses de produto orientam o projeto; resultados de pesquisa com usuários exigem instrumentos, respostas e condições de aplicação documentados.

## Evolução do projeto

| Etapa | Trabalho e contribuição |
| --- | --- |
| Ideação e requisitos | Delimitação do problema, público e funcionalidades que a aplicação precisa atender |
| Prototipação | Interface navegável em React, Vite e TypeScript para explorar identidade visual, linguagem e jornadas |
| Avaliação do protótipo | Revisão de fluxos e interface para orientar ajustes, sem comprovar o comportamento do backend posterior |
| Aplicação implementada | Flutter, persistência e serviços Firebase, com operações integradas em Development |
| Qualidade e entrega | Testes automatizados, validação Android e CI/CD para sustentar integração e distribuição controlada |
| Polimento | Correções observadas no carregamento, chat, notificações e interface, acompanhadas de medições |
| Consolidação acadêmica | Metodologia, resultados e limites alinhados ao produto implementado |

A expressão “versão 5.0” identifica uma etapa do protótipo, não a versão do aplicativo Flutter. O [protótipo histórico](https://handmade-b0f.pages.dev/) continua útil para observar a evolução visual, em uma demonstração com dados simulados.

## Como o desenvolvimento foi avaliado

As funcionalidades foram confrontadas com o código, a documentação técnica e o comportamento observado. Problemas encontrados motivaram correções e verificações direcionadas. A avaliação combinou:

- análise estática e testes automatizados do aplicativo e dos serviços;
- testes de integração e de regras de acesso em ambiente isolado;
- execução do aplicativo em Android, com observação de estados e navegação;
- inspeção de telas e variações de largura, escala de texto e tema;
- comparação de artefatos equivalentes e amostras controladas de desempenho;
- acompanhamento da integração e da distribuição automatizada.

Os resultados apresentados correspondem à entrega técnica de setembro de 2026. Testes anteriores foram reaproveitados quando mantinham validade; medições intermediárias foram substituídas pelos resultados consolidados. As [condições e limitações](resultados.md) estão junto de cada número.

## Contribuição acadêmica

O trabalho demonstra a passagem de requisitos e prototipação para uma aplicação com persistência, comunicação, integrações, testes e entrega controlada. Também registra a importância de distinguir intenção de produto, implementação e evidência de resultado.

O próximo avanço de avaliação é uma pesquisa de usabilidade do aplicativo atual com documentação suficiente para análise, além da ampliação dos testes em aparelhos. Isso permitirá estudar resultados de uso que os testes técnicos, por si só, não comprovam.

## Referências de contexto

- [Ellen MacArthur Foundation — introdução à economia circular](https://www.ellenmacarthurfoundation.org/topics/circular-economy-introduction/overview).
- [Brasil — Política Nacional de Resíduos Sólidos, Lei nº 12.305/2010](https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/lei/l12305.htm).
- [Brasil — Lei Geral de Proteção de Dados, Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm).
- [Nielsen Norman Group — dez heurísticas de usabilidade](https://www.nngroup.com/articles/ten-usability-heuristics/).
- [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/).
- [Resto de Obra — plataforma do segmento](https://restodeobra.com.br/).

Essas fontes fundamentam o contexto e os critérios de avaliação. Elas não validam as métricas do HandMade, que derivam dos registros técnicos do próprio projeto.
