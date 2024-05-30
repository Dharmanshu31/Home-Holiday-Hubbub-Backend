import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Property } from './schemas/property.schema';
import { Model } from 'mongoose';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Query } from 'express-serve-static-core';
import { Request } from 'express';
import * as sharp from 'sharp';
import * as path from 'path';
import { AddressFormate } from 'src/utils/address-formater';
const axios = require('axios');
@Injectable()
export class PropertyService {
  constructor(@InjectModel(Property.name) private propertyModel: Model<Property>) {}

  async createProperty(
    property: CreatePropertyDto,
    req: Request,
    files: Express.Multer.File[],
  ): Promise<Property> {
    if (files) {
      property.images = [];
      let count = 1;
      for (const file of files) {
        const filename = `Peoperty-${property.name}-${Date.now()}-${count++}.jpeg`;
        const absolutePath = path.resolve(
          __dirname,
          `../../../frontend/public/assets/properts/${filename}`,
        );
        await sharp(file.buffer)
          .resize(2000, 1333)
          .toFormat('jpeg')
          .jpeg({ quality: 90 })
          .toFile(absolutePath);
        property.images.push(filename);
      }
    }
    const cor = await AddressFormate.getPropertyLocation(property.address);
    if (
      property.location.coordinates[0] === 0 &&
      property.location.coordinates[1] === 0
    ) {
      (property.location.coordinates[0] = cor.lag),
        (property.location.coordinates[1] = cor.lat);
    }
    const propertyObj = { ...property, owner: req.user['_id'] };
    const newProperty = await this.propertyModel.create(propertyObj);
    return newProperty;
  }

  async getAllproperty(query: Query): Promise<{ properties: Property[]; total: number }> {
    // Clone and clean the query object
    const newQuery = { ...query };
    const notAllowField: string[] = ['page', 'sort', 'limit', 'fields'];
    notAllowField.forEach((el): boolean => delete newQuery[el]);

    // Build the filter object
    let filter: any = {};
    if (query.keyword) {
      filter = { name: { $regex: query.keyword, $options: 'i' } };
    } else {
      let queryStr: string = JSON.stringify(newQuery);
      queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match): string => `$${match}`);
      filter = JSON.parse(queryStr);
    }

    let que = this.propertyModel.find(filter);

    // Apply sorting
    if (query.sort) {
      const sortBy = (query.sort as string).split(',').join(' ');
      que = que.sort(sortBy);
    } else {
      que = que.sort('-createdAt');
    }

    // Apply field selection
    if (query.fields) {
      const fields = (query.fields as string).split(',').join(' ');
      que = que.select(fields);
    } else {
      que = que.select('-__v');
    }

    // Get the total number of documents
    const total = await this.propertyModel.countDocuments(filter);

    // Apply pagination
    if (query.page && query.limit) {
      const page = +query.page;
      const limit = +query.limit;
      const skip = (page - 1) * limit;
      que = que.skip(skip).limit(limit);
    }

    // Execute the query and return the results
    const properties = await que;
    return { properties, total };
  }

  async getOneProperty(id: string): Promise<Property> {
    const property = await this.propertyModel
      .findById(id)
      .populate({ path: 'reviews', select: '-__v' });
    return property;
  }

  async updateProperty(
    id: string,
    updateDto: UpdatePropertyDto,
    files: Express.Multer.File[],
  ): Promise<Property> {
    const property = await this.propertyModel.findByIdAndUpdate(id, updateDto, {
      new: true,
      runValidators: true,
    });
    if (files) {
      updateDto.images = [];
      let count = 1;
      for (const file of files) {
        const filename = `Peoperty-${updateDto.name ? updateDto.name : property['name']}-${Date.now()}-${count++}.jpeg`;
        const absolutePath = path.resolve(
          __dirname,
          `../../../frontend/public/assets/properts/${filename}`,
        );
        await sharp(file.buffer)
          .resize(2000, 1333)
          .toFormat('jpeg')
          .jpeg({ quality: 90 })
          .toFile(absolutePath);
        property.images.push(filename);
      }
    }
    property.save({ validateBeforeSave: false });
    return property;
  }

  async deleteProperty(id: string): Promise<string> {
    await this.propertyModel.findByIdAndDelete(id);
    return 'Property Deleted';
  }

  async getNearMe(latlag: string, unit: string, query: Query): Promise<{}> {
    const [lat, lag]: string[] = latlag.split(',');
    const multipiler: number = unit === 'km' ? 0.001 : 0.000621371;
    const data = await axios.get(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lag}&localityLanguage=en`,
    );
    const city: string = data.data.city;

    const finalQuery = [];

    finalQuery.push(
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [+lag, +lat],
          },
          distanceField: 'distance',
          distanceMultiplier: multipiler,
        },
      },
      {
        $match: { 'location.city': city },
      },
      {
        $project: {
          distance: 1,
          name: 1,
          'location.city': 1,
          propertyType: 1,
          'location.state': 1,
          pricePerNight: 1,
          ratingsAverage: 1,
          images: 1,
          owner: 1,
        },
      },
    );

    const page = +query.page;
    const limit = +query.limit;
    const skip = (page - 1) * limit;

    const countQuery = [...finalQuery, { $count: 'total' }];

    const nearProperty = await Promise.all([
      this.propertyModel.aggregate(finalQuery).skip(skip).limit(limit),
      this.propertyModel.aggregate(countQuery),
    ]);

    return nearProperty;
  }

  async getByDistance(latlag: string, distance: string, query: Query): Promise<{}> {
    const [lat, lag]: string[] = latlag.split(',');
    const radius = +distance / 6371;
    if (isNaN(radius) || radius < 0) {
      throw new Error('Invalid radius');
    }
    const page = +query.page;
    const limit = +query.limit;
    const skip = (page - 1) * limit;
    const newQuery = {
      location: { $geoWithin: { $centerSphere: [[lag, lat], radius] } },
    };
    const distanceProperty = await Promise.all([
      this.propertyModel.find(newQuery).skip(skip).limit(limit),
      this.propertyModel.countDocuments(newQuery),
    ]);
    return distanceProperty;
  }

  //admin work
  async numberOfProperty(): Promise<number> {
    const property = await this.propertyModel.countDocuments();
    return property;
  }
}
