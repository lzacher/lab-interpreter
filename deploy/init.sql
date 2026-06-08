-- ─── Lab Interpreter — Inicialização do Banco de Dados ──────────────────────
-- Este script é executado automaticamente pelo MySQL na primeira inicialização
-- do contêiner, apenas se o volume do banco estiver vazio.

-- Garantir que o banco existe e configurar charset
CREATE DATABASE IF NOT EXISTS lab_interpreter
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE lab_interpreter;

-- Garantir permissões do usuário da aplicação
GRANT ALL PRIVILEGES ON lab_interpreter.* TO 'labuser'@'%';
FLUSH PRIVILEGES;
