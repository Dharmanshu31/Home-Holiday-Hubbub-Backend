import { Module } from '@nestjs/common';
import { PropertyModule } from './property/property.module';
import { UserModule } from './user/user.module';
import { ReviewModule } from './review/review.module';
import { BookingModule } from './booking/booking.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_FILTER, RouterModule } from '@nestjs/core';
import { AsyncExceptionFilter } from './exception/async-exception.filter';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MulterModule.register(),
    RouterModule.register([{ path: 'property', module: ReviewModule }]),
    MongooseModule.forRoot(process.env.MONGO_URL),
    PropertyModule,
    UserModule,
    ReviewModule,
    BookingModule,
    AuthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AsyncExceptionFilter }],
})
export class AppModule {}
