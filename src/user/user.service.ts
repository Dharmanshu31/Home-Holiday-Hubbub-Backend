import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Request } from 'express';
import { Model } from 'mongoose';
import { User } from 'src/auth/schemas/user.schema';
import { UpdateuserDto } from './dto/update-user.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import * as sharp from 'sharp';
import * as path from 'path';
import { Query } from 'express-serve-static-core';
import { UpdateuserByAdminDto } from './dto/updateUserAdmin.dto';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  //get current login user
  async getMe(req: Request): Promise<User> {
    const user = await this.userModel.findOne({ _id: req.user['_id'], isActive: true });
    if (!user) {
      throw new NotFoundException({
        message: 'No User found with that ID. Please check the ID and try again. ',
      });
    }
    return user;
  }

  //update user
  async updateMe(
    updateUserDto: UpdateuserDto,
    req: Request,
    file: Express.Multer.File,
  ): Promise<User> {
    if (file) {
      const filename = `user-${updateUserDto.name ? updateUserDto.name : req.user['name']}-${Date.now()}.jpeg`;
      const absolutePath = path.resolve(
        __dirname,
        `../../../frontend/public/assets/users/${filename}`,
      );
      await sharp(file.buffer)
        .resize(500, 500)
        .toFormat('jpeg')
        .jpeg({ quality: 90 })
        .toFile(absolutePath);
      updateUserDto.photo = filename;
    }
    const user = await this.userModel.findByIdAndUpdate(req.user['_id'], updateUserDto, {
      new: true,
      runValidators: true,
    });
    if (!user) {
      throw new NotFoundException({
        message: 'No User found with that ID. Please check the ID and try again. ',
      });
    }

    return user;
  }

  //soft deletion of user
  async deleteMe(req: Request): Promise<void> {
    const user = await this.userModel.findOne({ _id: req.user['_id'] });
    user.isActive = false;
    await user.save({ validateBeforeSave: false });
    if (!user) {
      throw new NotFoundException({
        message: 'No User found with that ID. Please check the ID and try again. ',
      });
    }
  }

  //update user password
  async updatePassword(updatePasswordDto: UpdatePasswordDto, req: Request) {
    const user = await this.userModel.findById(req.user['_id']).select('+password');
    if (!(await user.comparePassword(updatePasswordDto.currentPassword, user.password))) {
      throw new UnauthorizedException({
        message:
          'Incorrect old password. Please enter the correct password or reset your password.',
      });
    }
    user.password = updatePasswordDto.password;
    user.confirmPassword = updatePasswordDto.confirmPassword;
    await user.save();

    return user;
  }

  //admin work

  //pagination and filter user
  async getAllUser(query: Query): Promise<User[]> {
    let filter: any = {};
    if (query.role) {
      filter.role = query.role;
    }
    if (query.keyword) {
      filter.name = { $regex: query.keyword, $options: 'i' };
    }
    let que = this.userModel.find(filter);
    if (query.page) {
      const page = +query.page;
      const limit = +query.limit;
      const skip = (page - 1) * limit;
      que = que.skip(skip).limit(limit);
    }
    if (query.sort) {
      const sortBy = (query.sort as string).split(',').join(' ');
      que = que.sort(sortBy);
    } else {
      que = que.sort('-createdAt');
    }

    const users = await que;
    return users;
  }

  //update user
  async updateUserByAdmin(
    updateUserDto: UpdateuserByAdminDto,
    id: string,
  ): Promise<User> {
    const user = await this.userModel.findByIdAndUpdate(id, updateUserDto, {
      new: true,
      runValidators: true,
    });
    if (!user) {
      throw new NotFoundException({
        message: 'No User found with that ID. Please check the ID and try again. ',
      });
    }

    return user;
  }

  //delete user hard deletion
  async deleteUserByAdmin(id: string): Promise<void> {
    const user = await this.userModel.findByIdAndDelete(id);
    if (!user) {
      throw new NotFoundException({
        message: 'No User found with that ID. Please check the ID and try again. ',
      });
    }
  }

  //number of user
  async numberOfUsers(): Promise<number> {
    const user = await this.userModel.countDocuments();
    return user;
  }

  //user wishlist

  //add wishlist
  async addWishList(propertyId: string, req: Request): Promise<User> {
    const user = await this.userModel.findById(req.user['_id']);
    if (user.wishList.includes(propertyId)) {
      const index = user.wishList.indexOf(propertyId);
      if (index !== -1) {
        user.wishList.splice(index, 1);
      }
    } else {
      user.wishList.push(propertyId);
    }
    await user.save({ validateBeforeSave: false });
    return user;
  }

  //get user wishlist id for like check
  async getOnlyWishList(req: Request): Promise<User> {
    const user = await this.userModel.findById(req.user['_id']).select('wishList');
    return user;
  }

  //get wishlist with data
  async getWishList(req: Request, query: Query) {
    const page = +query.page;
    const limit = +query.limit;
    const skip = (page - 1) * limit;
    const que = this.userModel.findById(req.user['_id']).select('wishList').populate({
      path: 'wishList',
      options: {
        skip,
        limit,
      },
    });
    const user = await Promise.all([
      await que,
      (await this.userModel.findById(req.user['_id'])).wishList.length,
    ]);
    return user;
  }
}
