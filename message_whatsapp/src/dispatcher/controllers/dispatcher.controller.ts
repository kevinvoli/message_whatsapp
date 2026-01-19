import { Controller } from '@nestjs/common';

@Controller('dispatcher')
export class DispatcherController {
  constructor() {}

  // Admin/debug routes will be added here.
  // e.g., forcing distribution, getting queue status.
}
