import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewriteLinks, linkChanges } from '../public/js/links.js';

const one = (from, to, byName = true) => [{ from, to, byName }];

test('enlaces por nombre y por ruta, con alias, sección e incrustados', () => {
  const text = [
    'Ver [[Reforma]] y [[Proyectos/Casa/Reforma|la reforma]].',
    'Sección: [[Reforma#Presupuesto]] · imagen ![[Reforma]]',
    'Otra: [[Reformas]] y [[Proyectos/Casa/Otra]]',
  ].join('\n');
  const out = rewriteLinks(text, one('Proyectos/Casa/Reforma', 'Proyectos/Hogar/Reforma de la cocina'));
  assert.equal(out, [
    'Ver [[Reforma de la cocina]] y [[Proyectos/Hogar/Reforma de la cocina|la reforma]].',
    'Sección: [[Reforma de la cocina#Presupuesto]] · imagen ![[Reforma de la cocina]]',
    'Otra: [[Reformas]] y [[Proyectos/Casa/Otra]]',
  ].join('\n'));
});

test('mayúsculas indiferentes y sin cambios devuelve null', () => {
  assert.equal(rewriteLinks('[[reforma]]', one('Reforma', 'Obra')), '[[Obra]]');
  assert.equal(rewriteLinks('Nada que ver [[Otra]]', one('Reforma', 'Obra')), null);
  assert.equal(rewriteLinks('sin enlaces', one('Reforma', 'Obra')), null);
});

test('no toca código', () => {
  const text = 'Escribe `[[Reforma]]` así\n```\n[[Reforma]]\n```\n> ```\n> [[Reforma]]\n> ```\n[[Reforma]]';
  assert.equal(rewriteLinks(text, one('Reforma', 'Obra')),
    'Escribe `[[Reforma]]` así\n```\n[[Reforma]]\n```\n> ```\n> [[Reforma]]\n> ```\n[[Obra]]');
});

test('mover de carpeta sin cambiar de nombre solo cambia los enlaces con ruta', () => {
  const text = '[[Reforma]] · [[Casa/Reforma]]';
  assert.equal(rewriteLinks(text, one('Casa/Reforma', 'Hogar/Reforma')), '[[Reforma]] · [[Hogar/Reforma]]');
});

test('nombres repetidos: no se adivina y se usa la ruta completa si hace falta', () => {
  const all = ['A/Notas', 'B/Notas', 'C/Plan', 'D/Idea'];
  const [ambiguous] = linkChanges([{ from: 'A/Notas', to: 'A/Apuntes' }], all);
  assert.equal(ambiguous.byName, false);
  assert.equal(rewriteLinks('[[Notas]] [[A/Notas]]', [ambiguous]), '[[Notas]] [[A/Apuntes]]');
  const [clash] = linkChanges([{ from: 'C/Plan', to: 'C/Idea' }], all);
  assert.equal(clash.byName, true);
  assert.equal(clash.toName, 'C/Idea');
  assert.equal(rewriteLinks('[[Plan]]', [clash]), '[[C/Idea]]');
});

test('renombrar una carpeta: varias notas a la vez', () => {
  const all = ['Casa/Reforma', 'Casa/Jardín', 'Inicio'];
  const changes = linkChanges([{ from: 'Casa/Reforma', to: 'Hogar/Reforma' }, { from: 'Casa/Jardín', to: 'Hogar/Jardín' }], all);
  assert.equal(rewriteLinks('[[Casa/Reforma]] [[Casa/Jardín|jardín]] [[Reforma]]', changes),
    '[[Hogar/Reforma]] [[Hogar/Jardín|jardín]] [[Reforma]]');
});
