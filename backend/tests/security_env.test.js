const { validateEnvironment } = require('../src/config/envValidation');

describe('Validação Fail-fast de Ambiente (Módulo 5)', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('deve logar e continuar em modo não-produção', () => {
    process.env.NODE_ENV = 'development';
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});
    
    validateEnvironment();
    
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('deve abortar (fail-fast) se iniciar em produção sem JWT_SECRET', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});
    const mockLoggerError = vi.spyOn(require('../src/utils/safeLogger').forModule('envValidation'), 'error').mockImplementation(() => {});
    
    validateEnvironment();
    
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('deve abortar se JWT_SECRET for fraco (menor que 16 caracteres)', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = '12345'; // Muito curto
    
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});
    
    validateEnvironment();
    
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('deve prosseguir se a configuração de produção for válida', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'super-seguro-12345678901234567890';
    
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});
    
    validateEnvironment();
    
    expect(mockExit).not.toHaveBeenCalled();
  });
});
