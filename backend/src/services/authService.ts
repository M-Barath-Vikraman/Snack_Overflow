import prisma from '../config/database';
import { hashPassword, comparePassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { AppError } from '../middleware/errorMiddleware';
import { RegisterInput, LoginInput } from '../schemas/authSchemas';
import { RoleType } from '../types';

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: RoleType;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResult {
  user: UserResponse;
  token: string;
}

export class AuthService {
  async register(input: RegisterInput): Promise<AuthResult> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      throw new AppError('An account with this email already exists', 409, 'EMAIL_ALREADY_EXISTS');
    }

    // Hash password with bcrypt
    const hashedPassword = await hashPassword(input.password);

    // Persist new user with strictly assigned MEMBER role
    const newUser = await prisma.user.create({
      data: {
        name: input.name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role: 'MEMBER'
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true
      }
    });

    const token = generateToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role as RoleType
    });

    return {
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role as RoleType,
        createdAt: newUser.createdAt,
        updatedAt: newUser.updatedAt
      },
      token
    };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      // Return identical error without revealing whether the email exists
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const isMatch = await comparePassword(input.password, user.password);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role as RoleType
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as RoleType,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      token
    };
  }
}

export const authService = new AuthService();
