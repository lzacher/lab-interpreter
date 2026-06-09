-- Seed: Criar usuário admin para o Lab Interpreter
-- Email: admin@drzacher.com | Senha: Lz@ch3r
-- Hash bcrypt gerado com 12 rounds

INSERT INTO users (openId, name, email, loginMethod, role, passwordHash, lastSignedIn)
VALUES (
  'local:admin@drzacher.com',
  'Dr. Zacher',
  'admin@drzacher.com',
  'local',
  'admin',
  '$2b$12$EpYFFOJ2UMZ9DZfdd83qqOH0pnHEcK2KcXPcZDC7x1XbIX1GE1MrW',
  NOW()
)
ON DUPLICATE KEY UPDATE
  passwordHash = '$2b$12$EpYFFOJ2UMZ9DZfdd83qqOH0pnHEcK2KcXPcZDC7x1XbIX1GE1MrW',
  role = 'admin',
  name = 'Dr. Zacher';
