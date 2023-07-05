import { IsEmail, MinLength, MaxLength, validate, IsString } from 'class-validator';
import { Request, Response } from 'express';
import { ErrorCode } from '../util/error-code';
import { ErrorException } from '../util/error-exception';

class CreateUserDTO {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export const createUser = async (req: Request, res: Response): Promise<void> => {
  const dto = new CreateUserDTO();
  dto.name = req.body.name;
  dto.email = req.body.email;
  dto.password = req.body.password;

  const errors = await validate(dto);
  if (errors.length) {
    throw new ErrorException(ErrorCode.Validation, errors);
  }

  res.send({ success: true });
};

