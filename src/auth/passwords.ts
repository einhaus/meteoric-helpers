import bcrypt from 'bcrypt';

export const verifyPassword = async (password: string, hashedPassword: string): Promise<boolean> => {
    return bcrypt.compare(password, hashedPassword);
};

export const saltAndHashPassword = async (password: string): Promise<string> => {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
};
