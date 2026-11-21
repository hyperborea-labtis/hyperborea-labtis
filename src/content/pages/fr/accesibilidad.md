---
lang: "fr"
slug: "accesibilidad"
title: "Déclaration d’accessibilité"
draft: false
---
Hyperborea. Revista de ensayo y creación souhaite que son site web soit utilisable sans obstacle : au clavier, avec un lecteur d’écran, avec un agrandissement du texte ou de l’écran et avec les modes de contraste élevé. Cette déclaration indique ce que nous faisons, ce que nous savons encore insuffisant et comment nous signaler un obstacle.

## État de conformité

L’objectif est de respecter les [Règles pour l’accessibilité des contenus Web (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) au niveau AA. **État actuel : partiellement conforme.** Des contrôles automatiques s’exécutent à chaque modification et ne trouvent aujourd’hui aucun manquement ; l’évaluation manuelle avec des lecteurs d’écran et d’autres technologies d’assistance reste à compléter, et les contenus importés de l’ancien site présentent les limites détaillées ci-dessous.

## Ce que nous faisons

- **Des tests à chaque modification.** Avant toute publication, on exécute automatiquement l’outil axe-core avec les règles WCAG 2.0, 2.1 et 2.2 (niveaux A et AA) et les bonnes pratiques sur un échantillon fixe de vingt pages dans les trois langues, la validation du HTML de toutes les pages et des contrôles de structure : un seul titre principal, un texte alternatif sur chaque image, une langue déclarée et un lien « Passer au contenu principal » comme premier élément.
- **Clavier.** Tout est utilisable au clavier. Le focus est toujours visible et l’en-tête fixe ne le masque pas. Le sous-menu s’ouvre avec Entrée ou Espace et se ferme avec Échap.
- **Contraste et couleur.** Les textes et les bordures des contrôles respectent les rapports de contraste 4,5:1 et 3:1. Les liens dans le texte sont soulignés et ne se distinguent pas uniquement par la couleur.
- **Adaptation.** Le contenu se réorganise jusqu’à 320 pixels de large sans défilement horizontal, supporte l’espacement du texte augmenté, respecte la préférence de réduction des animations et le mode de contraste élevé forcé de Windows.
- **Langues.** Chaque texte déclare sa langue. Les textes qui n’existent qu’en espagnol sont présentés comme tels dans les versions anglaise et française, avec leur langue indiquée, afin que les lecteurs d’écran les prononcent correctement.

## Limites connues

- **Images dans les textes.** Les travaux importés de l’ancien site comptent 258 images dans le corps du texte. Toutes ont une description, mais 43 en ont une générique du type « Figure 4 », qui identifie l’image sans la décrire.
- **Images d’illustration.** Elles sont traitées comme décoratives, puisque le titre se trouve juste à côté, sauf si la rédaction fournit une description.
- **Fichiers PDF.** De nombreux travaux sont aussi proposés en PDF. Nous ne garantissons pas que ces fichiers soient balisés ni que leur texte soit sélectionnable : certains peuvent être des numérisations. Le texte complet figure toujours sur la page elle-même.
- **Logo.** Le logo de l’en-tête est une image de faible résolution et paraît flou sur les écrans haute densité. Nous prévoyons de le remplacer par une version vectorielle.
- **Évaluation manuelle en attente.** Nous n’avons pas encore terminé les tests avec des lecteurs d’écran (comme VoiceOver, NVDA ou TalkBack), ni avec des loupes et des logiciels de dictée.

## Comment nous signaler un obstacle

Si quelque chose ne peut pas être lu ou utilisé, écrivez-nous à [admin@microagencia.com](mailto:admin@microagencia.com). Indiquez l’adresse de la page, le problème rencontré et, si vous le souhaitez, la technologie d’assistance que vous utilisez. Nous répondrons dans les meilleurs délais et, si le contenu ne peut pas être corrigé immédiatement, nous vous proposerons une solution alternative.

## Date et révision

Cette déclaration a été préparée le 21 novembre 2026. Nous la réviserons au moins une fois par an et à chaque modification importante du site.
